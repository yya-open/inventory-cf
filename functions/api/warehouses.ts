import { requireAuth, errorResponse, json } from "../_auth";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return json(false, null, "未绑定 D1 数据库(DB)");
    const { results } = await env.DB.prepare("SELECT id, name FROM warehouses ORDER BY id ASC").all();
    return Response.json({ ok: true, data: results });
  } catch (e: any) {
    return errorResponse(e);
  }
};
