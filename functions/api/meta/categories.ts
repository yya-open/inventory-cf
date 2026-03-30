import { requireAuth, errorResponse, json } from "../../_auth";
import { listItemCategories } from '../services/item-categories';

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
