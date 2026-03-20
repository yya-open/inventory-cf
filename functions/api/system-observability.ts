import { errorResponse, json } from '../_auth';
import { requirePermission } from '../_permissions';
import { ensureRequestErrorLogTable } from './services/ops-tools';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requirePermission(env, request, 'ops_tools', 'admin');
    await ensureRequestErrorLogTable(env.DB);
    const limit = Math.max(1, Math.min(200, Number(new URL(request.url).searchParams.get('limit') || 50)));
    const [slowRows, errorRows] = await Promise.all([
      env.DB.prepare(`SELECT id, method, path, status, total_ms, sql_ms, auth_ms, created_at FROM slow_request_log ORDER BY id DESC LIMIT ?`).bind(limit).all<any>().catch(() => ({ results: [] })),
      env.DB.prepare(`SELECT id, method, path, status, total_ms, sql_ms, auth_ms, created_at FROM request_error_log ORDER BY id DESC LIMIT ?`).bind(limit).all<any>(),
    ]);
    const summary = {
      slow_over_1s: (slowRows.results || []).filter((row: any) => Number(row?.total_ms || 0) >= 1000).length,
      error_5xx: (errorRows.results || []).filter((row: any) => Number(row?.status || 0) >= 500).length,
    };
    return json(true, { slow_requests: slowRows.results || [], error_requests: errorRows.results || [], summary });
  } catch (e: any) {
    return errorResponse(e);
  }
};
