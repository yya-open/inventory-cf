import { requireAuth, errorResponse, json } from "../../_auth";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return json(false, null, "未绑定 D1 数据库(DB)");
    const { results } = await env.DB.prepare("SELECT DISTINCT category FROM items WHERE enabled=1 AND category IS NOT NULL AND TRIM(category)<>'' ORDER BY category ASC").all();
    const list = (results as any[]).map(r => r.category);
    return Response.json({ ok: true, data: list });
  } catch (e: any) {
    return errorResponse(e);
  }
};
