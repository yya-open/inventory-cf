import { errorResponse, requireAuth } from '../../_auth';
import { normalizeUserDataScope } from '../services/data-scope';
import { buildScopePreview } from '../services/scope-preview';

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'admin');
    const body = await request.json().catch(() => ({} as any));
    const scope = normalizeUserDataScope(body?.data_scope_type, body?.data_scope_value, body?.data_scope_value2);
    return Response.json({ ok: true, data: await buildScopePreview(env.DB, scope) });
  } catch (e: any) {
    return errorResponse(e);
  }
};
