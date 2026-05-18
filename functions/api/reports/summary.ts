import { requireAuthWithDataScope } from '../services/data-scope';
import { getDashboardSummary, parseDashboardParams } from '../services/dashboard-report';
import { withErrorHandling } from '../_error';

export const onRequestGet = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const user = await requireAuthWithDataScope(env, request, 'viewer');
  const params = parseDashboardParams(request);
  return Response.json(await getDashboardSummary(env.DB, user, params));
});
