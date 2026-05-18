import { apiOk, apiFail } from './_response';
import { withErrorHandling } from './_error';
import { getAssetInventoryOverview } from './services/asset-inventory-overview';
import { requireAuthWithDataScope } from './services/data-scope';

export const onRequestGet = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const user = await requireAuthWithDataScope(env, request, 'viewer');
  if (!env.DB) return apiFail('未绑定 D1 数据库(DB)', { status: 500 });
  return apiOk(await getAssetInventoryOverview(env.DB, env, request, 'pc', user));
});
