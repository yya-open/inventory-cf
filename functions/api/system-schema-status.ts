import { errorResponse, json, requireAuth } from '../_auth';
import { getSchemaStatus } from './services/schema-status';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    const url = new URL(request.url);
    const force = url.searchParams.get('force') === '1';
    const status = await getSchemaStatus(env.DB, { force });
    return json(true, status);
  } catch (e: any) {
    return errorResponse(e);
  }
};
