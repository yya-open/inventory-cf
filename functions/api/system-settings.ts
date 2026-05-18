import { json, requireAuth } from './_auth';
import { withErrorHandling } from './_error';
import { requirePermission } from '../_permissions';
import { getSystemSettings, updateSystemSettings } from './services/system-settings';

type Env = { DB: D1Database; JWT_SECRET?: string };

export const onRequestGet = withErrorHandling<Env>(async ({ env, request }) => {
  const timing = ((env as any).__timing || null) as { measure?: <T>(name: string, fn: () => Promise<T> | T) => Promise<T> } | null;
  await requireAuth(env, request, 'viewer');
  const force = new URL(request.url).searchParams.get('force') === '1';
  const data = timing?.measure
    ? await timing.measure('system_settings_read', () => getSystemSettings(env.DB, { force }))
    : await getSystemSettings(env.DB, { force });
  return json(true, data);
});

export const onRequestPut = withErrorHandling<Env>(async ({ env, request }) => {
  const user = await requirePermission(env, request, 'system_settings_write', 'viewer');
  const body = await request.json().catch(() => ({}));
  const data = await updateSystemSettings(env.DB, body || {}, user.username || null);
  return json(true, data, '保存成功');
});
