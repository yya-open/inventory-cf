import { errorResponse, json, requireAuth } from './_auth';
import { getSystemSettings, updateSystemSettings } from './services/system-settings';

type Env = { DB: D1Database; JWT_SECRET?: string };

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'admin');
    const data = await getSystemSettings(env.DB);
    return json(true, data);
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, 'admin');
    const body = await request.json().catch(() => ({}));
    const data = await updateSystemSettings(env.DB, body || {}, user.username || null);
    return json(true, data, '保存成功');
  } catch (e: any) {
    return errorResponse(e);
  }
};
