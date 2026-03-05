import { requireAuth, errorResponse } from "../_auth";
import { ensureMonitorSchemaIfAllowed } from "./_monitor";
import { buildKeywordWhere } from "./_search";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const status = (url.searchParams.get("status") || "").trim();
    const locationId = Number(url.searchParams.get("location_id") || 0) || 0;
    const keyword = (url.searchParams.get("keyword") || "").trim();

    const wh: string[] = [];
    const binds: any[] = [];
    if (status) {
      wh.push("a.status=?");
      binds.push(status);
    }
    if (locationId) {
      wh.push("a.location_id=?");
      binds.push(locationId);
    }
    if (keyword) {
      const kw = buildKeywordWhere(keyword, {
        numericId: "a.id",
        exact: ["a.asset_code", "a.sn", "a.employee_no"],
        prefix: ["a.asset_code", "a.sn", "a.brand", "a.model", "a.employee_name", "a.department"],
        contains: ["a.brand", "a.model", "a.remark", "a.employee_name", "a.department"],
      });
      if (kw.sql) {
        wh.push(kw.sql);
        binds.push(...kw.binds);
      }
    }
    const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";
    const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM monitor_assets a ${where}`).bind(...binds).first<any>();
    return Response.json({ ok: true, data: { total: Number(row?.c || 0) } });
  } catch (e: any) {
    return errorResponse(e);
  }
};
