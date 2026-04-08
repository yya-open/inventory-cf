import { errorResponse } from '../_auth';
import { apiOk, apiFail } from './_response';
import { getAssetInventoryOverview } from './services/asset-inventory-overview';
import { requireAuthWithDataScope } from './services/data-scope';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'viewer');
    if (!env.DB) return apiFail('未绑定 D1 数据库(DB)', { status: 500 });
    return apiOk(await getAssetInventoryOverview(env.DB, env, request, 'pc', user));
  } catch (error: any) {
    return errorResponse(error);
  }
};
