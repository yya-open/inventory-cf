import { errorResponse } from '../_auth';
import { requireAuthWithDataScope } from '../services/data-scope';
import { getDashboardDetail, parseDashboardParams } from '../services/dashboard-report';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'viewer');
    const params = parseDashboardParams(request);
    return Response.json(await getDashboardDetail(env.DB, user, params));
  } catch (e: any) {
    return errorResponse(e);
  }
};
