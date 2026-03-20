import { sqlNowStored } from '../_time';
import { rebuildPcLatestStateForAssets } from './pc-latest-state';
import { syncSystemDictionaryUsageCounters } from './system-dictionaries';
import { materializeAuditFields, normalizeAuditAction } from '../_audit';
import { normalizeSearchText } from '../_search';

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
    if (statements.length >= 200) {
      await db.batch(statements.splice(0, statements.length));
    }
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

export async function loadOpsDashboard(db: D1Database) {
  await ensureRequestErrorLogTable(db);
  const [slow, err, jobs] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS c FROM slow_request_log`).first<any>().catch(() => ({ c: 0 })),
    db.prepare(`SELECT COUNT(*) AS c FROM request_error_log`).first<any>(),
    db.prepare(`SELECT COUNT(*) AS c FROM async_jobs`).first<any>().catch(() => ({ c: 0 })),
  ]);
  return {
    slow_request_count: Number((slow as any)?.c || 0),
    error_request_count: Number((err as any)?.c || 0),
    async_job_count: Number((jobs as any)?.c || 0),
  };
}
