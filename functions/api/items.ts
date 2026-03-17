import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
import {
  assertItemSkuUnique,
  buildItemsListQuery,
  countItems,
  createItem,
  getItemById,
  listItems,
  parseItemInput,
  softDeleteItem,
  updateItem,
} from './services/inventory';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    const query = buildItemsListQuery(new URL(request.url));
    const [total, rows] = await Promise.all([
      countItems(env.DB, query),
      listItems(env.DB, query),
    ]);

    return Response.json({
      ok: true,
      data: rows,
      total,
      page: query.page,
      pageSize: query.pageSize,
      keyword_mode: query.keyword_mode,
      sort_by: query.sort_by,
      sort_dir: query.sort_dir,
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, 'admin');
    const body = await request.json();
    const id = body?.id ? Number(body.id) : null;
    const input = parseItemInput(body);

    const before = id ? await getItemById(env.DB, id) : null;
    await assertItemSkuUnique(env.DB, input.sku, id);

    let entityId = id;
    if (id) {
      await updateItem(env.DB, id, input);
    } else {
      entityId = await createItem(env.DB, input);
    }

    const after = entityId ? await getItemById(env.DB, entityId) : input;
    await logAudit(env.DB, request, user, id ? 'ITEM_UPDATE' : 'ITEM_CREATE', 'items', entityId, { before, after });

    return Response.json({ ok: true, id: entityId });
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestDelete: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, 'admin');
    const body = await request.json<any>().catch(() => ({}));
    const id = Number(body?.id);
    if (!id) return Response.json({ ok: false, message: 'id 无效' }, { status: 400 });

    const before = await getItemById(env.DB, id);
    if (!before) return Response.json({ ok: false, message: '配件不存在' }, { status: 404 });

    await softDeleteItem(env.DB, id);
    await logAudit(env.DB, request, user, 'ITEM_DELETE', 'items', id, { before });

    return Response.json({ ok: true });
  } catch (e: any) {
    return errorResponse(e);
  }
};
