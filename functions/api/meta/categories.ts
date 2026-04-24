import { requireAuth, errorResponse, json } from "../../_auth";
import { deleteItemCategoryByName, listItemCategories } from '../services/item-categories';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return json(false, null, "未绑定 D1 数据库(DB)");
    const list = await listItemCategories(env.DB);
    return Response.json({ ok: true, data: list.map((row) => row.name) });
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestDelete: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");
    if (!env.DB) return json(false, null, "未绑定 D1 数据库(DB)");
    const body = await request.json<any>().catch(() => ({}));
    const name = String(body?.name || '').trim();
    if (!name) return json(false, null, '分类名称无效', 400, 'INVALID_PARAMS');
    const deleted = await deleteItemCategoryByName(env.DB, name);
    return json(true, deleted, '删除成功');
  } catch (e: any) {
    return errorResponse(e);
  }
};
