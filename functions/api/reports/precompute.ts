import { errorResponse, requireAuth } from '../_auth';
import { precomputeDashboardSnapshots } from '../services/dashboard-report';

function authorizedByScheduler(env: any, request: Request) {
  const token = String(env?.SNAPSHOT_SCHEDULER_TOKEN || '').trim();
  if (!token) return false;
  const supplied = String(request.headers.get('x-scheduler-token') || request.headers.get('x-snapshot-token') || '').trim();
  return !!supplied && supplied === token;
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string; SNAPSHOT_SCHEDULER_TOKEN?: string }> = async ({ env, request }) => {
  try {
    const byScheduler = authorizedByScheduler(env, request);
    const actor = byScheduler ? { id: 0, username: 'scheduler', role: 'admin' } as any : await requireAuth(env, request, 'admin');
    const body = await request.json().catch(() => ({} as any));
    const result = await precomputeDashboardSnapshots(env.DB, { days: body?.days, force: body?.force === true || body?.force === 1 || body?.force === '1' });
    return Response.json({ ok: true, actor: actor.username, data: result, message: '日快照预计算完成' });
  } catch (e: any) {
    return errorResponse(e);
  }
};
