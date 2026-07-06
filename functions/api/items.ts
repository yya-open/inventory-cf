import { requireAuth } from '../_auth';
import { withErrorHandling } from './_error';
import { logAudit } from './_audit';
import {
  assertItemSkuUnique,
  buildItemsListQuery,
  countItems,
  createItem,
  generateItemSku,
  getItemById,
  listItems,
  parseItemInput,
  softDeleteItem,
  updateItem,
} from './services/inventory';

export const onRequestGet = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
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
});

export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const user = await requireAuth(env, request, 'admin');
  const body = await request.json();
  const id = body?.id ? Number(body.id) : null;
  const input = parseItemInput(body, { allowAutoSku: !id });
  if (!id && !input.sku) {
    input.sku = await generateItemSku(env.DB, input);
  }

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

  return Response.json({ ok: true, id: entityId, sku: after?.sku || input.sku });
});

export const onRequestDelete = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const user = await requireAuth(env, request, 'admin');
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!id) return Response.json({ ok: false, message: 'id 无效' }, { status: 400 });

  const before = await getItemById(env.DB, id);
  if (!before) return Response.json({ ok: false, message: '配件不存在' }, { status: 404 });

  await softDeleteItem(env.DB, id);
  await logAudit(env.DB, request, user, 'ITEM_DELETE', 'items', id, { before });

  return Response.json({ ok: true });
});
