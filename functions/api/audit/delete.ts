import { requireAuth, errorResponse } from "../../_auth";

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");
    const body: any = await request.json().catch(() => ({}));

    const idsRaw = body?.ids ?? (body?.id !== undefined ? [body.id] : []);
    const ids = Array.isArray(idsRaw)
      ? idsRaw.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0)
      : [];

    if (!ids.length) {
      return Response.json({ ok: false, message: "缺少 id" }, { status: 400 });
    }
    if (ids.length > 200) {
      return Response.json({ ok: false, message: "一次最多删除 200 条" }, { status: 400 });
    }

    const placeholders = ids.map(() => "?").join(",");
    const r = await env.DB.prepare(`DELETE FROM audit_log WHERE id IN (${placeholders})`).bind(...ids).run();

    return Response.json({ ok: true, deleted: Number(r.changes || 0) });
  } catch (e: any) {
    return errorResponse(e);
  }
};
