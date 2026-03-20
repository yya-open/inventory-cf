import { sqlNowStored } from '../_time';
import { rebuildPcLatestStateForAssets } from './pc-latest-state';
import { syncSystemDictionaryUsageCounters } from './system-dictionaries';
import { materializeAuditFields, normalizeAuditAction } from '../_audit';
import { normalizeSearchText } from '../_search';
import { getSchemaStatus } from './schema-status';

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
  return { rows: Number(row?.c || 0) };
}

export async function repairAuditMaterialized(db: D1Database) {
  const { results } = await db.prepare(`SELECT id, action, entity, entity_id, payload_json FROM audit_log ORDER BY id ASC`).all<any>();
  const statements: D1PreparedStatement[] = [];
  let count = 0;
  for (const row of results || []) {
    let payload: any = null;
    try { payload = row?.payload_json ? JSON.parse(String(row.payload_json)) : null; } catch {}
    const action = normalizeAuditAction(String(row?.action || ''));
    const materialized = materializeAuditFields(action, row?.entity ?? null, row?.entity_id ?? null, payload);
    statements.push(db.prepare(
      `UPDATE audit_log SET target_name=?, target_code=?, summary_text=?, search_text_norm=? WHERE id=?`
    ).bind(materialized.target_name, materialized.target_code, materialized.summary_text, materialized.search_text_norm, row.id));
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

async function scanPcLatestState(db: D1Database) {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM pc_assets a LEFT JOIN pc_asset_latest_state s ON s.asset_id=a.id WHERE s.asset_id IS NULL`).first<any>().catch(() => ({ c: 0 }));
  const count = Number(row?.c || 0);
  return {
    key: 'pc_latest_state',
    label: '电脑快照',
    affected_count: count,
    status: count > 0 ? 'warn' : 'ok',
    detail: count > 0 ? `发现 ${count} 台电脑缺少最新状态快照` : '电脑快照完整',
    recommendation: count > 0 ? '建议执行“重建电脑快照”' : '无需处理',
  };
}

async function scanDictionaryCounters(db: D1Database) {
  const expectedByKey = new Map<string, number>();
  const queries = [
    [`SELECT 'pc_brand' AS dictionary_key, COUNT(*) AS c FROM (SELECT TRIM(COALESCE(brand,'')) AS k FROM pc_assets GROUP BY TRIM(COALESCE(brand,'')))`, 'pc_brand'],
    [`SELECT 'monitor_brand' AS dictionary_key, COUNT(*) AS c FROM (SELECT TRIM(COALESCE(brand,'')) AS k FROM monitor_assets GROUP BY TRIM(COALESCE(brand,'')))`, 'monitor_brand'],
    [`SELECT 'asset_archive_reason' AS dictionary_key, COUNT(*) AS c FROM (
      SELECT TRIM(COALESCE(archived_reason,'')) AS k FROM pc_assets WHERE archived=1 GROUP BY TRIM(COALESCE(archived_reason,''))
      UNION ALL
      SELECT TRIM(COALESCE(archived_reason,'')) AS k FROM monitor_assets WHERE archived=1 GROUP BY TRIM(COALESCE(archived_reason,''))
    )`, 'asset_archive_reason'],
    [`SELECT 'department' AS dictionary_key, COUNT(*) AS c FROM (
      SELECT TRIM(COALESCE(current_department,'')) AS k FROM pc_asset_latest_state GROUP BY TRIM(COALESCE(current_department,''))
      UNION ALL
      SELECT TRIM(COALESCE(department,'')) AS k FROM monitor_assets GROUP BY TRIM(COALESCE(department,''))
    )`, 'department'],
  ] as const;
  for (const [sql, key] of queries) {
    const row = await db.prepare(sql).first<any>().catch(() => ({ c: 0 }));
    expectedByKey.set(key, Number(row?.c || 0));
  }
  const { results } = await db.prepare(`SELECT dictionary_key, COUNT(*) AS c FROM dictionary_usage_counters GROUP BY dictionary_key`).all<any>().catch(() => ({ results: [] }));
  let mismatch = 0;
  for (const key of ['pc_brand', 'monitor_brand', 'asset_archive_reason', 'department']) {
    const actual = Number((results || []).find((item: any) => item?.dictionary_key === key)?.c || 0);
    if (actual !== Number(expectedByKey.get(key) || 0)) mismatch += 1;
  }
  return {
    key: 'dictionary_counters',
    label: '字典引用计数',
    affected_count: mismatch,
    status: mismatch > 0 ? 'warn' : 'ok',
    detail: mismatch > 0 ? `发现 ${mismatch} 类字典计数与实际引用不一致` : '字典引用计数正常',
    recommendation: mismatch > 0 ? '建议执行“重算字典引用”' : '无需处理',
  };
}

async function scanAuditMaterialized(db: D1Database) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS c FROM audit_log
     WHERE COALESCE(module_code,'')=''
        OR COALESCE(summary_text,'')=''
        OR COALESCE(search_text_norm,'')=''`
  ).first<any>().catch(() => ({ c: 0 }));
  const count = Number(row?.c || 0);
  return {
    key: 'audit_materialized',
    label: '审计物化字段',
    affected_count: count,
    status: count > 0 ? 'warn' : 'ok',
    detail: count > 0 ? `发现 ${count} 条审计记录缺少物化展示/搜索字段` : '审计物化字段完整',
    recommendation: count > 0 ? '建议执行“回填审计物化”' : '无需处理',
  };
}

async function scanSearchNorm(db: D1Database) {
  const [pc, monitor] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS c FROM pc_assets WHERE COALESCE(search_text_norm,'')=''`).first<any>().catch(() => ({ c: 0 })),
    db.prepare(`SELECT COUNT(*) AS c FROM monitor_assets WHERE COALESCE(search_text_norm,'')=''`).first<any>().catch(() => ({ c: 0 })),
  ]);
  const count = Number(pc?.c || 0) + Number(monitor?.c || 0);
  return {
    key: 'search_norm',
    label: '搜索规范化',
    affected_count: count,
    status: count > 0 ? 'warn' : 'ok',
    detail: count > 0 ? `发现 ${count} 条资产记录缺少规范化搜索字段` : '搜索规范化字段完整',
    recommendation: count > 0 ? '建议执行“重建搜索规范化”' : '无需处理',
  };
}

export async function scanRepairCenter(db: D1Database) {
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

export async function loadOpsDashboard(db: D1Database) {
  await ensureRequestErrorLogTable(db);
  const [slow, err, jobs, failedJobs, queuedJobs, schema, scan] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS c FROM slow_request_log`).first<any>().catch(() => ({ c: 0 })),
    db.prepare(`SELECT COUNT(*) AS c FROM request_error_log`).first<any>(),
    db.prepare(`SELECT COUNT(*) AS c FROM async_jobs`).first<any>().catch(() => ({ c: 0 })),
    db.prepare(`SELECT COUNT(*) AS c FROM async_jobs WHERE status='failed'`).first<any>().catch(() => ({ c: 0 })),
    db.prepare(`SELECT COUNT(*) AS c FROM async_jobs WHERE status IN ('queued','running')`).first<any>().catch(() => ({ c: 0 })),
    getSchemaStatus(db),
    scanRepairCenter(db),
  ]);
  return {
    slow_request_count: Number((slow as any)?.c || 0),
    error_request_count: Number((err as any)?.c || 0),
    async_job_count: Number((jobs as any)?.c || 0),
    failed_job_count: Number((failedJobs as any)?.c || 0),
    queued_job_count: Number((queuedJobs as any)?.c || 0),
    schema_ok: !!schema.ok,
    repair_problem_count: Number(scan.total_problem_count || 0),
  };
}
