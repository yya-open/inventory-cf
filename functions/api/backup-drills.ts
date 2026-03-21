import { errorResponse, json, requireAuth } from '../_auth';
import { sqlNowStored } from './_time';
import { logAudit } from './_audit';

async function ensureBackupDrillTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS backup_drill_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drill_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
      outcome TEXT NOT NULL DEFAULT 'success',
      scenario TEXT,
      operator_id INTEGER,
      operator_name TEXT,
      note TEXT,
      issue_count INTEGER NOT NULL DEFAULT 0,
      follow_up_status TEXT NOT NULL DEFAULT 'not_required',
      rect_owner TEXT,
      rect_due_at TEXT,
      rect_closed_at TEXT,
      review_note TEXT,
      created_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
      updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()})
    )`
  ).run();
  for (const sql of [
    `ALTER TABLE backup_drill_runs ADD COLUMN issue_count INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE backup_drill_runs ADD COLUMN follow_up_status TEXT NOT NULL DEFAULT 'not_required'`,
    `ALTER TABLE backup_drill_runs ADD COLUMN rect_owner TEXT`,
    `ALTER TABLE backup_drill_runs ADD COLUMN rect_due_at TEXT`,
    `ALTER TABLE backup_drill_runs ADD COLUMN rect_closed_at TEXT`,
    `ALTER TABLE backup_drill_runs ADD COLUMN review_note TEXT`,
    `ALTER TABLE backup_drill_runs ADD COLUMN updated_at TEXT`,
  ]) {
    try { await db.prepare(sql).run(); } catch {}
  }
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_backup_drill_runs_drill_at ON backup_drill_runs(drill_at DESC, id DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_backup_drill_runs_follow_up_status ON backup_drill_runs(follow_up_status, rect_due_at, id DESC)`).run();
  await db.prepare(`UPDATE backup_drill_runs SET updated_at=COALESCE(updated_at, created_at, drill_at, ${sqlNowStored()})`).run().catch(() => {});
}

function normalizeFollowStatus(input: any, outcome: string, issueCount: number) {
  const raw = String(input || '').trim();
  if (['open', 'closed', 'not_required'].includes(raw)) return raw as 'open' | 'closed' | 'not_required';
  return outcome === 'success' && issueCount <= 0 ? 'not_required' : 'open';
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'admin');
    await ensureBackupDrillTable(env.DB);
    const { results } = await env.DB.prepare(`SELECT id, drill_at, outcome, scenario, operator_name, note, issue_count, follow_up_status, rect_owner, rect_due_at, rect_closed_at, review_note, created_at, updated_at FROM backup_drill_runs ORDER BY id DESC LIMIT 20`).all<any>();
    return json(true, results || []);
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, 'admin');
    await ensureBackupDrillTable(env.DB);
    const body = await request.json<any>().catch(() => ({}));
    const scenario = String(body?.scenario || 'restore_drill').trim() || 'restore_drill';
    const outcome = ['success', 'warn', 'failed'].includes(String(body?.outcome || '').trim()) ? String(body?.outcome).trim() : 'success';
    const note = String(body?.note || '').trim().slice(0, 1000);
    const issue_count = Math.max(0, Math.min(99, Number(body?.issue_count || 0) || 0));
    const follow_up_status = normalizeFollowStatus(body?.follow_up_status, outcome, issue_count);
    const rect_owner = String(body?.rect_owner || '').trim().slice(0, 120) || null;
    const rect_due_at = String(body?.rect_due_at || '').trim().slice(0, 20) || null;
    const review_note = String(body?.review_note || '').trim().slice(0, 1000) || null;
    const rect_closed_at = follow_up_status === 'closed' ? String(body?.rect_closed_at || '').trim().slice(0, 20) || new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
    const res = await env.DB.prepare(`INSERT INTO backup_drill_runs (scenario, outcome, operator_id, operator_name, note, issue_count, follow_up_status, rect_owner, rect_due_at, rect_closed_at, review_note, drill_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${sqlNowStored()}, ${sqlNowStored()}, ${sqlNowStored()})`).bind(scenario, outcome, actor.id ?? null, actor.username ?? null, note || null, issue_count, follow_up_status, rect_owner, rect_due_at, rect_closed_at, review_note).run();
    const id = Number((res as any)?.meta?.last_row_id || 0);
    await logAudit(env.DB, request, actor, 'ADMIN_BACKUP_DRILL_RECORD', 'backup_drill', id, { scenario, outcome, note, issue_count, follow_up_status, rect_owner, rect_due_at, review_note });
    return json(true, { id }, '演练记录已保存');
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPut: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, 'admin');
    await ensureBackupDrillTable(env.DB);
    const body = await request.json<any>().catch(() => ({}));
    const id = Number(body?.id || 0);
    if (!id) throw Object.assign(new Error('缺少演练记录ID'), { status: 400 });
    const before = await env.DB.prepare(`SELECT * FROM backup_drill_runs WHERE id=?`).bind(id).first<any>();
    if (!before) throw Object.assign(new Error('演练记录不存在'), { status: 404 });
    const outcome = ['success', 'warn', 'failed'].includes(String(body?.outcome || '').trim()) ? String(body?.outcome).trim() : String(before.outcome || 'success');
    const issue_count = typeof body?.issue_count === 'undefined' ? Number(before.issue_count || 0) : Math.max(0, Math.min(99, Number(body?.issue_count || 0) || 0));
    const follow_up_status = normalizeFollowStatus(typeof body?.follow_up_status === 'undefined' ? before.follow_up_status : body?.follow_up_status, outcome, issue_count);
    const scenario = String(typeof body?.scenario === 'undefined' ? before.scenario : body?.scenario || '').trim().slice(0, 120) || 'restore_drill';
    const note = String(typeof body?.note === 'undefined' ? before.note : body?.note || '').trim().slice(0, 1000) || null;
    const rect_owner = String(typeof body?.rect_owner === 'undefined' ? before.rect_owner : body?.rect_owner || '').trim().slice(0, 120) || null;
    const rect_due_at = String(typeof body?.rect_due_at === 'undefined' ? before.rect_due_at : body?.rect_due_at || '').trim().slice(0, 20) || null;
    const review_note = String(typeof body?.review_note === 'undefined' ? before.review_note : body?.review_note || '').trim().slice(0, 1000) || null;
    const rect_closed_at = follow_up_status === 'closed'
      ? String(body?.rect_closed_at || before.rect_closed_at || '').trim().slice(0, 20) || new Date().toISOString().slice(0, 19).replace('T', ' ')
      : null;
    await env.DB.prepare(`UPDATE backup_drill_runs SET scenario=?, outcome=?, note=?, issue_count=?, follow_up_status=?, rect_owner=?, rect_due_at=?, rect_closed_at=?, review_note=?, updated_at=${sqlNowStored()} WHERE id=?`).bind(scenario, outcome, note, issue_count, follow_up_status, rect_owner, rect_due_at, rect_closed_at, review_note, id).run();
    const after = await env.DB.prepare(`SELECT id, drill_at, outcome, scenario, operator_name, note, issue_count, follow_up_status, rect_owner, rect_due_at, rect_closed_at, review_note, created_at, updated_at FROM backup_drill_runs WHERE id=?`).bind(id).first<any>();
    await logAudit(env.DB, request, actor, 'ADMIN_BACKUP_DRILL_UPDATE', 'backup_drill', id, { before, after });
    return json(true, after, '演练闭环已更新');
  } catch (e: any) {
    return errorResponse(e);
  }
};
