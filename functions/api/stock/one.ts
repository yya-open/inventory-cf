import { requireAuth, errorResponse } from '../../_auth';
import { getStockForItem } from '../services/inventory';

/**
 * GET /api/stock/one?item_id=1&warehouse_id=1
 * Return stock quantity for a single item in a warehouse.
 * (Used by StockOut.vue to show available qty.)
 */
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');

    const url = new URL(request.url);
    const item_id = Number(url.searchParams.get('item_id') || 0);
    const warehouse_id = Number(url.searchParams.get('warehouse_id') || 1);

    if (!item_id) {
      return Response.json({ ok: false, message: '缺少 item_id' }, { status: 400 });
    }

    return Response.json({ ok: true, data: await getStockForItem(env.DB, item_id, warehouse_id) });
  } catch (e: any) {
    return errorResponse(e);
  }
};
