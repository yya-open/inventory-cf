import { sqlNowStored } from '../_time';
import { runDataIntegrityChecks, type DataIntegrityIssue } from './data-integrity';

export type DataQualityStatus = 'open' | 'in_progress' | 'ignored' | 'resolved';
const VALID_STATUSES = new Set<DataQualityStatus>(['open', 'in_progress', 'ignored', 'resolved']);

export async function ensureDataQualityCaseSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS data_quality_cases (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_key TEXT NOT NULL UNIQUE, severity TEXT NOT NULL CHECK(severity IN ('error', 'warn')), source_table TEXT, title TEXT NOT NULL, detail TEXT, affected_count INTEGER NOT NULL DEFAULT 0, sample_json TEXT, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'ignored', 'resolved')), owner TEXT, due_at TEXT, note TEXT, first_seen_at TEXT NOT NULL DEFAULT (${sqlNowStored()}), last_seen_at TEXT NOT NULL DEFAULT (${sqlNowStored()}), resolved_at TEXT, updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()}))`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_data_quality_cases_status_severity_seen ON data_quality_cases(status, severity, last_seen_at DESC, id DESC)`).run();
}

export async function scanDataQualityCases(db: D1Database) {
  await ensureDataQualityCaseSchema(db);
  const scan = await runDataIntegrityChecks(db, { sampleLimit: 8 });
  const statements: D1PreparedStatement[] = scan.issues.map((issue: DataIntegrityIssue) => db.prepare(`INSERT INTO data_quality_cases (issue_key, severity, source_table, title, detail, affected_count, sample_json, status, first_seen_at, last_seen_at, resolved_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ${sqlNowStored()}, ${sqlNowStored()}, NULL, ${sqlNowStored()}) ON CONFLICT(issue_key) DO UPDATE SET severity=excluded.severity, source_table=excluded.source_table, title=excluded.title, detail=excluded.detail, affected_count=excluded.affected_count, sample_json=excluded.sample_json, status=CASE WHEN data_quality_cases.status='resolved' THEN 'open' ELSE data_quality_cases.status END, resolved_at=CASE WHEN data_quality_cases.status='resolved' THEN NULL ELSE data_quality_cases.resolved_at END, last_seen_at=${sqlNowStored()}, updated_at=${sqlNowStored()}`).bind(issue.key, issue.severity, issue.table || null, `${issue.table || 'database'}: ${issue.key}`, issue.message, Math.max(0, Number(issue.count || 0)), JSON.stringify(issue.sample || [])));
  if (statements.length) await db.batch(statements);
  return { ...scan, scanned_cases: scan.issues.length };
}

export async function listDataQualityCases(db: D1Database, options?: { status?: string; limit?: number }) {
  await ensureDataQualityCaseSchema(db);
  const status = String(options?.status || '').trim();
  const limit = Math.max(1, Math.min(200, Number(options?.limit || 100)));
  const filtered = VALID_STATUSES.has(status as DataQualityStatus);
  const sql = filtered ? `SELECT * FROM data_quality_cases WHERE status=? ORDER BY CASE severity WHEN 'error' THEN 0 ELSE 1 END, datetime(last_seen_at) DESC, id DESC LIMIT ?` : `SELECT * FROM data_quality_cases ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'ignored' THEN 2 ELSE 3 END, CASE severity WHEN 'error' THEN 0 ELSE 1 END, datetime(last_seen_at) DESC, id DESC LIMIT ?`;
  const result = filtered ? await db.prepare(sql).bind(status, limit).all<any>() : await db.prepare(sql).bind(limit).all<any>();
  return (result.results || []).map((row: any) => ({ ...row, id: Number(row.id || 0), affected_count: Number(row.affected_count || 0), sample: (() => { try { return JSON.parse(String(row.sample_json || '[]')); } catch { return []; } })() }));
}

export async function updateDataQualityCase(db: D1Database, id: number, input: { status?: string; owner?: unknown; due_at?: unknown; note?: unknown }) {
  await ensureDataQualityCaseSchema(db);
  const status = input.status && VALID_STATUSES.has(String(input.status) as DataQualityStatus) ? String(input.status) as DataQualityStatus : null;
  const owner = input.owner === undefined ? undefined : String(input.owner || '').trim().slice(0, 120) || null;
  const dueAt = input.due_at === undefined ? undefined : String(input.due_at || '').trim().slice(0, 40) || null;
  const note = input.note === undefined ? undefined : String(input.note || '').trim().slice(0, 1000) || null;
  if (!status && owner === undefined && dueAt === undefined && note === undefined) throw Object.assign(new Error('No changes supplied'), { status: 400 });
  const current = await db.prepare(`SELECT * FROM data_quality_cases WHERE id=?`).bind(id).first<any>();
  if (!current) throw Object.assign(new Error('Data quality case not found'), { status: 404 });
  const nextStatus = status || String(current.status || 'open');
  await db.prepare(`UPDATE data_quality_cases SET status=?, owner=?, due_at=?, note=?, resolved_at=CASE WHEN ?='resolved' THEN COALESCE(resolved_at, ${sqlNowStored()}) ELSE NULL END, updated_at=${sqlNowStored()} WHERE id=?`).bind(nextStatus, owner === undefined ? current.owner : owner, dueAt === undefined ? current.due_at : dueAt, note === undefined ? current.note : note, nextStatus, id).run();
  return await db.prepare(`SELECT * FROM data_quality_cases WHERE id=?`).bind(id).first<any>();
}
