import { requireAuth, errorResponse, json } from '../../../_auth';
import { ensureCoreSchema } from '../../_schema';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'admin');
    await ensureCoreSchema(env.DB);
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 100);
    const r = await env.DB.prepare(`SELECT id, status, stage, mode, filename, created_by, total_rows, processed_rows, snapshot_status, snapshot_filename, created_at, updated_at, completed_at FROM restore_job ORDER BY created_at DESC LIMIT ?`).bind(limit).all<any>();
    return json(true, { items: r.results || [] });
  } catch (e: any) {
    return errorResponse(e);
  }
};
