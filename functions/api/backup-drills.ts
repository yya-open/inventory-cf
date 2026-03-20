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
      created_at TEXT NOT NULL DEFAULT (${sqlNowStored()})
    )`
  ).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_backup_drill_runs_drill_at ON backup_drill_runs(drill_at DESC, id DESC)`).run();
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'admin');
    await ensureBackupDrillTable(env.DB);
    const { results } = await env.DB.prepare(`SELECT id, drill_at, outcome, scenario, operator_name, note, created_at FROM backup_drill_runs ORDER BY id DESC LIMIT 20`).all<any>();
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
    const res = await env.DB.prepare(`INSERT INTO backup_drill_runs (scenario, outcome, operator_id, operator_name, note, drill_at, created_at) VALUES (?, ?, ?, ?, ?, ${sqlNowStored()}, ${sqlNowStored()})`).bind(scenario, outcome, actor.id ?? null, actor.username ?? null, note || null).run();
    const id = Number((res as any)?.meta?.last_row_id || 0);
    await logAudit(env.DB, request, actor, 'ADMIN_BACKUP_DRILL_RECORD', 'backup_drill', id, { scenario, outcome, note });
    return json(true, { id }, '演练记录已保存');
  } catch (e: any) {
    return errorResponse(e);
  }
};
