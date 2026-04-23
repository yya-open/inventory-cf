import { errorResponse } from '../_auth';
import { ensurePcReadFastGuards } from './_pc';
import { buildPcAssetQuery } from './services/asset-ledger';
import { queryInventorySummaryByWhere } from './services/asset-inventory-state';
import { isDefaultInventorySummaryRequest, readDefaultInventorySummaryCache } from './services/asset-inventory-summary-cache';
import { requireAuthWithDataScope } from './services/data-scope';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    await ensurePcReadFastGuards(env.DB);

    if (isDefaultInventorySummaryRequest(url, 'pc')) {
      const data = await readDefaultInventorySummaryCache(env.DB, 'pc', user);
      return Response.json({ ok: true, data, cached: true });
    }

    const params = new URL(url);
    params.searchParams.delete('inventory_status');
    const query = buildPcAssetQuery(params, user);
    const data = await queryInventorySummaryByWhere(env.DB, 'pc_assets a', query);
    return Response.json({ ok: true, data });
  } catch (error: any) {
    return errorResponse(error);
  }
};
