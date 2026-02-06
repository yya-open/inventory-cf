import { requireAuth, errorResponse } from "../_auth";

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "admin");

    const body: any = await request.json().catch(() => ({}));
    const st_id = Number(body?.id);
    if (!st_id) return Response.json({ ok:false, message:"缺少盘点单 id" }, { status:400 });

    const st = await env.DB.prepare(`SELECT * FROM stocktake WHERE id=?`).bind(st_id).first() as any;
    if (!st) return Response.json({ ok:false, message:"盘点单不存在" }, { status:404 });
    if (st.status !== "DRAFT") return Response.json({ ok:false, message:"盘点单已应用，不能删除" }, { status:400 });

    // delete lines first (no cascade)
    await env.DB.prepare(`DELETE FROM stocktake_line WHERE stocktake_id=?`).bind(st_id).run();
    await env.DB.prepare(`DELETE FROM stocktake WHERE id=?`).bind(st_id).run();

    return Response.json({ ok:true, id: st_id });
  } catch (e:any) {
    return errorResponse(e);
  }
};
