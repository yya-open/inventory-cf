import { sqlNowStored } from '../_time';
import { rebuildPcLatestStateForAssets } from './pc-latest-state';
import { syncSystemDictionaryUsageCounters } from './system-dictionaries';
import { materializeAuditFields, normalizeAuditAction, resolveAuditModuleCode, isAuditHighRisk } from '../_audit';
import { normalizeSearchText } from '../_search';
import { getSchemaStatus } from './schema-status';

export type RepairScanExample = Record<string, any>;
export type RepairScanItem = {
  key: string;
  label: string;
  affected_count: number;
  status: 'ok' | 'warn';
  detail: string;
  recommendation: string;
  examples?: RepairScanExample[];
};

export type RepairScanResult = {
  total_problem_count: number;
  affected_rows: number;
  last_scanned_at?: string | null;
  scan_source?: 'cache' | 'fresh';
  items: RepairScanItem[];
};

const OPS_SCAN_KEY = 'repair_center';
const AUTO_SCAN_INTERVAL_MINUTES = 15;

const REPAIR_ACTION_LABEL: Record<string, string> = {
  scan_all: '执行巡检扫描',
  repair_all: '一键全量修复',
  repair_pc_latest_state: '重建电脑快照',
  repair_dictionary_counters: '重算字典引用',
  repair_audit_materialized: '回填审计物化',
  repair_search_norm: '重建搜索规范化',
};

export async function ensureSlowRequestLogTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS slow_request_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      method TEXT,
      path TEXT,
      status INTEGER,
      total_ms INTEGER,
      sql_ms INTEGER,
      auth_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (${sqlNowStored()})
    )`
  ).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_slow_request_log_created_path ON slow_request_log(created_at DESC, path, status)`).run();
}

export async function ensureRequestErrorLogTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS request_error_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      method TEXT,
      path TEXT,
      status INTEGER,
      total_ms INTEGER,
      sql_ms INTEGER,
      auth_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (${sqlNowStored()})
    )`
  ).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_request_error_log_created_status ON request_error_log(created_at DESC, status, path)`).run();
}

export async function ensureOpsScanStateTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS ops_scan_state (
      scan_key TEXT PRIMARY KEY,
      total_problem_count INTEGER NOT NULL DEFAULT 0,
      affected_rows INTEGER NOT NULL DEFAULT 0,
      scan_json TEXT,
      last_scan_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
      updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()})
    )`
  ).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_ops_scan_state_updated_at ON ops_scan_state(updated_at DESC)`).run();
}

export async function ensureAdminRepairHistoryTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS admin_repair_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_key TEXT NOT NULL,
      action_label TEXT NOT NULL,
      actor_id INTEGER,
      actor_name TEXT,
      before_problem_count INTEGER NOT NULL DEFAULT 0,
      before_affected_rows INTEGER NOT NULL DEFAULT 0,
      repaired_count INTEGER NOT NULL DEFAULT 0,
      after_problem_count INTEGER NOT NULL DEFAULT 0,
      after_affected_rows INTEGER NOT NULL DEFAULT 0,
      success INTEGER NOT NULL DEFAULT 1,
      result_summary TEXT,
      detail_json TEXT,
      error_text TEXT,
      created_at TEXT NOT NULL DEFAULT (${sqlNowStored()})
    )`
  ).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_admin_repair_history_created_at ON admin_repair_history(created_at DESC, id DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_admin_repair_history_action_key ON admin_repair_history(action_key, id DESC)`).run();
}

async function isRepairScanStale(db: D1Database) {
  await ensureOpsScanStateTable(db);
  const row = await db.prepare(
    `SELECT CASE
       WHEN last_scan_at IS NULL THEN 1
       WHEN last_scan_at < datetime('now','+8 hours', ?) THEN 1
       ELSE 0
     END AS stale
     FROM ops_scan_state
     WHERE scan_key=?`
  ).bind(`-${AUTO_SCAN_INTERVAL_MINUTES} minute`, OPS_SCAN_KEY).first<any>();
  if (!row) return true;
  return Number(row?.stale || 0) === 1;
}

async function readStoredRepairScan(db: D1Database): Promise<RepairScanResult | null> {
  await ensureOpsScanStateTable(db);
  const row = await db.prepare(`SELECT scan_json, last_scan_at FROM ops_scan_state WHERE scan_key=?`).bind(OPS_SCAN_KEY).first<any>();
  if (!row?.scan_json) return null;
  try {
    const data = JSON.parse(String(row.scan_json || '{}')) as RepairScanResult;
    return { ...data, last_scanned_at: row?.last_scan_at || data?.last_scanned_at || null, scan_source: 'cache' };
  } catch {
    return null;
  }
}

async function persistRepairScan(db: D1Database, scan: RepairScanResult) {
  await ensureOpsScanStateTable(db);
  const serialized = JSON.stringify({
    total_problem_count: Number(scan.total_problem_count || 0),
    affected_rows: Number(scan.affected_rows || 0),
    items: Array.isArray(scan.items) ? scan.items : [],
  });
  await db.prepare(
    `INSERT INTO ops_scan_state (scan_key, total_problem_count, affected_rows, scan_json, last_scan_at, updated_at)
     VALUES (?, ?, ?, ?, ${sqlNowStored()}, ${sqlNowStored()})
     ON CONFLICT(scan_key) DO UPDATE SET
       total_problem_count=excluded.total_problem_count,
       affected_rows=excluded.affected_rows,
       scan_json=excluded.scan_json,
       last_scan_at=${sqlNowStored()},
       updated_at=${sqlNowStored()}`
  ).bind(OPS_SCAN_KEY, Number(scan.total_problem_count || 0), Number(scan.affected_rows || 0), serialized).run();
}

function normalizeCounterLabel(value: any) {
  return String(value ?? '').trim();
}

function addCounterRows(target: Record<string, number>, rows: any[] | undefined | null) {
  for (const row of rows || []) {
    const label = normalizeCounterLabel(row?.label);
    if (!label) continue;
    target[label] = Number(target[label] || 0) + Number(row?.c || 0);
  }
}

async function computeExpectedDictionaryCounterMaps(db: D1Database) {
  const counts: Record<string, Record<string, number>> = {
    pc_brand: {},
    monitor_brand: {},
    asset_archive_reason: {},
    department: {},
  };

  const [{ results: pcBrandRows }, { results: monitorBrandRows }, { results: archiveReasonRows }, { results: departmentRows }] = await Promise.all([
    db.prepare(`SELECT TRIM(COALESCE(brand, '')) AS label, COUNT(*) AS c FROM pc_assets GROUP BY TRIM(COALESCE(brand, ''))`).all<any>(),
    db.prepare(`SELECT TRIM(COALESCE(brand, '')) AS label, COUNT(*) AS c FROM monitor_assets GROUP BY TRIM(COALESCE(brand, ''))`).all<any>(),
    db.prepare(
      `SELECT label, SUM(c) AS c FROM (
         SELECT TRIM(COALESCE(archived_reason, '')) AS label, COUNT(*) AS c FROM pc_assets WHERE archived=1 GROUP BY TRIM(COALESCE(archived_reason, ''))
         UNION ALL
         SELECT TRIM(COALESCE(archived_reason, '')) AS label, COUNT(*) AS c FROM monitor_assets WHERE archived=1 GROUP BY TRIM(COALESCE(archived_reason, ''))
       ) t GROUP BY label`
    ).all<any>(),
    db.prepare(
      `SELECT label, SUM(c) AS c FROM (
         SELECT TRIM(COALESCE(current_department, '')) AS label, COUNT(*) AS c FROM pc_asset_latest_state GROUP BY TRIM(COALESCE(current_department, ''))
         UNION ALL
         SELECT TRIM(COALESCE(department, '')) AS label, COUNT(*) AS c FROM monitor_assets GROUP BY TRIM(COALESCE(department, ''))
       ) t GROUP BY label`
    ).all<any>(),
  ]);

  addCounterRows(counts.pc_brand, pcBrandRows);
  addCounterRows(counts.monitor_brand, monitorBrandRows);
  addCounterRows(counts.asset_archive_reason, archiveReasonRows);
  addCounterRows(counts.department, departmentRows);
  return counts;
}

function computeAuditMaterializedFields(row: any) {
  let payload: any = null;
  try { payload = row?.payload_json ? JSON.parse(String(row.payload_json)) : null; } catch {}
  const action = normalizeAuditAction(String(row?.action || ''));
  const materialized = materializeAuditFields(action, row?.entity ?? null, row?.entity_id ?? null, payload);
  return {
    action,
    module_code: resolveAuditModuleCode(action, row?.entity ?? null),
    high_risk: Number(isAuditHighRisk(action)),
    target_name: materialized.target_name || null,
    target_code: materialized.target_code || null,
    summary_text: materialized.summary_text || null,
    search_text_norm: materialized.search_text_norm || null,
  };
}

function collectAuditMaterializedDiff(row: any) {
  const expected = computeAuditMaterializedFields(row);
  const mismatches: string[] = [];
  const fields: Array<keyof typeof expected> = ['module_code', 'high_risk', 'target_name', 'target_code', 'summary_text', 'search_text_norm'];
  for (const field of fields) {
    const actual = field === 'high_risk'
      ? Number(row?.[field] || 0)
      : String(row?.[field] ?? '').trim();
    const want = field === 'high_risk'
      ? Number(expected[field] || 0)
      : String(expected[field] ?? '').trim();
    if (actual !== want) mismatches.push(field);
  }
  return { expected, mismatch_fields: mismatches };
}

export async function repairPcLatestState(db: D1Database) {
  const { results } = await db.prepare(`SELECT id FROM pc_assets ORDER BY id ASC`).all<any>();
  const ids = (results || []).map((r: any) => Number(r?.id || 0)).filter(Boolean);
  for (let i = 0; i < ids.length; i += 200) {
    await rebuildPcLatestStateForAssets(db, ids.slice(i, i + 200));
  }
  return { repaired: ids.length };
}

export async function repairDictionaryCounters(db: D1Database) {
  await syncSystemDictionaryUsageCounters(db);
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM dictionary_usage_counters`).first<any>();
  return { repaired: Number(row?.c || 0), rows: Number(row?.c || 0) };
}

export async function repairAuditMaterialized(db: D1Database) {
  const { results } = await db.prepare(`SELECT id, action, entity, entity_id, payload_json, module_code, high_risk, target_name, target_code, summary_text, search_text_norm FROM audit_log ORDER BY id ASC`).all<any>();
  const statements: D1PreparedStatement[] = [];
  let count = 0;
  for (const row of results || []) {
    const diff = collectAuditMaterializedDiff(row);
    if (!diff.mismatch_fields.length) continue;
    statements.push(db.prepare(
      `UPDATE audit_log
       SET module_code=?, high_risk=?, target_name=?, target_code=?, summary_text=?, search_text_norm=?
       WHERE id=?`
    ).bind(
      diff.expected.module_code,
      diff.expected.high_risk,
      diff.expected.target_name,
      diff.expected.target_code,
      diff.expected.summary_text,
      diff.expected.search_text_norm,
      row.id,
    ));
    count += 1;
    if (statements.length >= 200) await db.batch(statements.splice(0, statements.length));
  }
  if (statements.length) await db.batch(statements);
  return { repaired: count };
}

export async function repairSearchNormalize(db: D1Database) {
  let repaired = 0;
  const { results: pcRows } = await db.prepare(`SELECT id, serial_no, brand, model, disk_capacity, memory_size, remark FROM pc_assets ORDER BY id ASC`).all<any>();
  const pcStatements: D1PreparedStatement[] = [];
  for (const row of pcRows || []) {
    pcStatements.push(db.prepare(`UPDATE pc_assets SET search_text_norm=? WHERE id=?`).bind(
      normalizeSearchText(row?.serial_no, row?.brand, row?.model, row?.remark, row?.disk_capacity, row?.memory_size), row.id
    ));
    repaired += 1;
  }
  if (pcStatements.length) await db.batch(pcStatements);
  const { results: monitorRows } = await db.prepare(`SELECT id, asset_code, sn, brand, model, size_inch, remark, department, employee_name FROM monitor_assets ORDER BY id ASC`).all<any>();
  const monStatements: D1PreparedStatement[] = [];
  for (const row of monitorRows || []) {
    monStatements.push(db.prepare(`UPDATE monitor_assets SET search_text_norm=? WHERE id=?`).bind(
      normalizeSearchText(row?.asset_code, row?.sn, row?.brand, row?.model, row?.size_inch, row?.remark, row?.department, row?.employee_name), row.id
    ));
    repaired += 1;
  }
  if (monStatements.length) await db.batch(monStatements);
  return { repaired };
}

async function scanPcLatestState(db: D1Database): Promise<RepairScanItem> {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM pc_assets a LEFT JOIN pc_asset_latest_state s ON s.asset_id=a.id WHERE s.asset_id IS NULL`).first<any>().catch(() => ({ c: 0 }));
  const count = Number(row?.c || 0);
  const examples = count > 0
    ? (await db.prepare(`SELECT a.id, COALESCE(a.serial_no,'') AS serial_no, COALESCE(a.brand,'') AS brand, COALESCE(a.model,'') AS model FROM pc_assets a LEFT JOIN pc_asset_latest_state s ON s.asset_id=a.id WHERE s.asset_id IS NULL ORDER BY a.id ASC LIMIT 10`).all<any>()).results || []
    : [];
  return {
    key: 'pc_latest_state',
    label: '电脑快照',
    affected_count: count,
    status: count > 0 ? 'warn' : 'ok',
    detail: count > 0 ? `发现 ${count} 台电脑缺少最新状态快照` : '电脑快照完整',
    recommendation: count > 0 ? '建议执行“重建电脑快照”' : '无需处理',
    examples,
  };
}

async function scanDictionaryCounters(db: D1Database): Promise<RepairScanItem> {
  const expected = await computeExpectedDictionaryCounterMaps(db);
  const { results } = await db.prepare(`SELECT dictionary_key, label, reference_count FROM dictionary_usage_counters`).all<any>().catch(() => ({ results: [] }));
  const actual: Record<string, Record<string, number>> = { pc_brand: {}, monitor_brand: {}, asset_archive_reason: {}, department: {} };
  for (const row of results || []) {
    const key = String(row?.dictionary_key || '');
    if (!actual[key]) continue;
    const label = normalizeCounterLabel(row?.label);
    if (!label) continue;
    actual[key][label] = Number(row?.reference_count || 0);
  }

  const diffs: any[] = [];
  for (const key of ['pc_brand', 'monitor_brand', 'asset_archive_reason', 'department']) {
    const expectedMap = expected[key] || {};
    const actualMap = actual[key] || {};
    const labels = new Set([...Object.keys(expectedMap), ...Object.keys(actualMap)]);
    for (const label of labels) {
      const exp = Number(expectedMap[label] || 0);
      const act = Number(actualMap[label] || 0);
      if (exp !== act) diffs.push({ dictionary_key: key, label, expected: exp, actual: act });
    }
  }
  diffs.sort((a, b) => String(a.dictionary_key).localeCompare(String(b.dictionary_key)) || String(a.label).localeCompare(String(b.label)));

  return {
    key: 'dictionary_counters',
    label: '字典引用计数',
    affected_count: diffs.length,
    status: diffs.length > 0 ? 'warn' : 'ok',
    detail: diffs.length > 0 ? `发现 ${diffs.length} 项字典计数与实际引用不一致` : '字典引用计数正常',
    recommendation: diffs.length > 0 ? '建议执行“重算字典引用”' : '无需处理',
    examples: diffs.slice(0, 20),
  };
}

async function scanAuditMaterialized(db: D1Database): Promise<RepairScanItem> {
  const { results } = await db.prepare(`SELECT id, action, entity, entity_id, payload_json, module_code, high_risk, target_name, target_code, summary_text, search_text_norm FROM audit_log ORDER BY id DESC`).all<any>().catch(() => ({ results: [] }));
  const diffs: any[] = [];
  for (const row of results || []) {
    const diff = collectAuditMaterializedDiff(row);
    if (!diff.mismatch_fields.length) continue;
    diffs.push({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entity_id: row.entity_id,
      mismatch_fields: diff.mismatch_fields,
    });
  }
  return {
    key: 'audit_materialized',
    label: '审计物化字段',
    affected_count: diffs.length,
    status: diffs.length > 0 ? 'warn' : 'ok',
    detail: diffs.length > 0 ? `发现 ${diffs.length} 条审计记录缺少或不匹配物化展示/搜索字段` : '审计物化字段完整',
    recommendation: diffs.length > 0 ? '建议执行“回填审计物化”' : '无需处理',
    examples: diffs.slice(0, 20),
  };
}

async function scanSearchNorm(db: D1Database): Promise<RepairScanItem> {
  const [pc, monitor] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS c FROM pc_assets WHERE COALESCE(search_text_norm,'')=''`).first<any>().catch(() => ({ c: 0 })),
    db.prepare(`SELECT COUNT(*) AS c FROM monitor_assets WHERE COALESCE(search_text_norm,'')=''`).first<any>().catch(() => ({ c: 0 })),
  ]);
  const count = Number(pc?.c || 0) + Number(monitor?.c || 0);
  const examples = count > 0
    ? (await db.prepare(
        `SELECT 'pc' AS asset_type, id, COALESCE(serial_no,'') AS code, COALESCE(brand,'') AS brand, COALESCE(model,'') AS model FROM pc_assets WHERE COALESCE(search_text_norm,'')=''
         UNION ALL
         SELECT 'monitor' AS asset_type, id, COALESCE(sn, COALESCE(asset_code,'')) AS code, COALESCE(brand,'') AS brand, COALESCE(model,'') AS model FROM monitor_assets WHERE COALESCE(search_text_norm,'')=''
         LIMIT 12`
      ).all<any>()).results || []
    : [];
  return {
    key: 'search_norm',
    label: '搜索规范化',
    affected_count: count,
    status: count > 0 ? 'warn' : 'ok',
    detail: count > 0 ? `发现 ${count} 条资产记录缺少规范化搜索字段` : '搜索规范化字段完整',
    recommendation: count > 0 ? '建议执行“重建搜索规范化”' : '无需处理',
    examples,
  };
}

export async function scanRepairCenter(db: D1Database): Promise<RepairScanResult> {
  const items = await Promise.all([
    scanPcLatestState(db),
    scanDictionaryCounters(db),
    scanAuditMaterialized(db),
    scanSearchNorm(db),
  ]);
  return {
    total_problem_count: items.reduce((sum, item) => sum + (item.affected_count > 0 ? 1 : 0), 0),
    affected_rows: items.reduce((sum, item) => sum + Number(item.affected_count || 0), 0),
    items,
  };
}

export async function forceRefreshRepairScan(db: D1Database): Promise<RepairScanResult> {
  const scan = await scanRepairCenter(db);
  await persistRepairScan(db, scan);
  return { ...scan, scan_source: 'fresh', last_scanned_at: new Date().toISOString() };
}

export async function getAutoRepairScan(db: D1Database, options?: { allowStale?: boolean; forceRefresh?: boolean }): Promise<RepairScanResult> {
  if (options?.forceRefresh) return await forceRefreshRepairScan(db);
  const stored = await readStoredRepairScan(db);
  if (options?.allowStale && stored) return stored;
  const stale = await isRepairScanStale(db);
  if (stale) return await forceRefreshRepairScan(db);
  return stored || await forceRefreshRepairScan(db);
}

export function actionLabel(action: string) {
  return REPAIR_ACTION_LABEL[action] || action;
}

function summarizeRepairedCount(action: string, result: any) {
  if (action === 'repair_all') {
    const repair = result?.repair || {};
    return Number(repair?.pc_latest_state?.repaired || 0)
      + Number(repair?.dictionary_counters?.repaired || repair?.dictionary_counters?.rows || 0)
      + Number(repair?.audit_materialized?.repaired || 0)
      + Number(repair?.search_norm?.repaired || 0);
  }
  if (action === 'repair_pc_latest_state') return Number(result?.repaired || 0);
  if (action === 'repair_dictionary_counters') return Number(result?.repaired || result?.rows || 0);
  if (action === 'repair_audit_materialized') return Number(result?.repaired || 0);
  if (action === 'repair_search_norm') return Number(result?.repaired || 0);
  return 0;
}

export function buildRepairResultSummary(action: string, data: any) {
  if (action === 'scan_all') {
    return `扫描完成：${Number(data?.total_problem_count || 0)} 类问题，影响 ${Number(data?.affected_rows || 0)} 条记录`;
  }
  const after = action === 'repair_all' ? data?.after : data?.after_scan;
  const remaining = Number(after?.total_problem_count || 0);
  const repaired = summarizeRepairedCount(action, data);
  if (action === 'repair_all') {
    return `全量修复完成：共处理 ${repaired} 项，修复后剩余 ${remaining} 类问题 / ${Number(after?.affected_rows || 0)} 条记录`;
  }
  return `${actionLabel(action)}完成：处理 ${repaired} 条，修复后剩余 ${remaining} 类问题 / ${Number(after?.affected_rows || 0)} 条记录`;
}

export async function recordRepairHistory(db: D1Database, input: {
  action: string;
  actor_id?: number | null;
  actor_name?: string | null;
  before_scan?: RepairScanResult | null;
  after_scan?: RepairScanResult | null;
  result?: any;
  summary?: string | null;
  success?: boolean;
  error_text?: string | null;
}) {
  await ensureAdminRepairHistoryTable(db);
  const before = input.before_scan || { total_problem_count: 0, affected_rows: 0 } as any;
  const after = input.after_scan || { total_problem_count: 0, affected_rows: 0 } as any;
  await db.prepare(
    `INSERT INTO admin_repair_history (
      action_key, action_label, actor_id, actor_name,
      before_problem_count, before_affected_rows,
      repaired_count, after_problem_count, after_affected_rows,
      success, result_summary, detail_json, error_text, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${sqlNowStored()})`
  ).bind(
    input.action,
    actionLabel(input.action),
    input.actor_id ?? null,
    input.actor_name ?? null,
    Number(before.total_problem_count || 0),
    Number(before.affected_rows || 0),
    summarizeRepairedCount(input.action, input.result),
    Number(after.total_problem_count || 0),
    Number(after.affected_rows || 0),
    input.success === false ? 0 : 1,
    input.summary || null,
    input.result == null ? null : JSON.stringify(input.result),
    input.error_text || null,
  ).run();
}

export async function listRepairHistory(db: D1Database, limit = 20) {
  await ensureAdminRepairHistoryTable(db);
  const { results } = await db.prepare(
    `SELECT id, action_key, action_label, actor_id, actor_name,
            before_problem_count, before_affected_rows, repaired_count,
            after_problem_count, after_affected_rows, success,
            result_summary, error_text, created_at
     FROM admin_repair_history
     ORDER BY id DESC
     LIMIT ?`
  ).bind(Math.max(1, Math.min(100, limit))).all<any>();
  return results || [];
}

export async function loadOpsDashboard(db: D1Database) {
  await ensureRequestErrorLogTable(db);
  await ensureOpsScanStateTable(db);
  await ensureAdminRepairHistoryTable(db);
  const [slow, err, jobs, failedJobs, queuedJobs, schema, scanState, repairHistory] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS c FROM slow_request_log`).first<any>().catch(() => ({ c: 0 })),
    db.prepare(`SELECT COUNT(*) AS c FROM request_error_log`).first<any>().catch(() => ({ c: 0 })),
    db.prepare(`SELECT COUNT(*) AS c FROM async_jobs`).first<any>().catch(() => ({ c: 0 })),
    db.prepare(`SELECT COUNT(*) AS c FROM async_jobs WHERE status='failed'`).first<any>().catch(() => ({ c: 0 })),
    db.prepare(`SELECT COUNT(*) AS c FROM async_jobs WHERE status IN ('queued','running')`).first<any>().catch(() => ({ c: 0 })),
    getSchemaStatus(db),
    getAutoRepairScan(db),
    db.prepare(`SELECT created_at FROM admin_repair_history ORDER BY id DESC LIMIT 1`).first<any>().catch(() => null),
  ]);
  return {
    slow_request_count: Number((slow as any)?.c || 0),
    error_request_count: Number((err as any)?.c || 0),
    async_job_count: Number((jobs as any)?.c || 0),
    failed_job_count: Number((failedJobs as any)?.c || 0),
    queued_job_count: Number((queuedJobs as any)?.c || 0),
    schema_ok: !!schema.ok,
    repair_problem_count: Number(scanState.total_problem_count || 0),
    last_scan_at: scanState.last_scanned_at || null,
    last_repair_at: repairHistory?.created_at || null,
  };
}
