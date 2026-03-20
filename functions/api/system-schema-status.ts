import { errorResponse, json, requireAuth } from '../_auth';
import { getSchemaStatus } from './services/schema-status';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    const status = await getSchemaStatus(env.DB);
    return json(true, status);
  } catch (e: any) {
    return errorResponse(e);
  }
};
