import { requireAuth, errorResponse } from "../_auth";
import { ensureMonitorSchemaIfAllowed } from "./_monitor";
import { buildKeywordWhere } from "./_search";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const type = (url.searchParams.get("type") || url.searchParams.get("tx_type") || "").trim().toUpperCase();
    const keyword = (url.searchParams.get("keyword") || "").trim();
    const start = (url.searchParams.get("start") || url.searchParams.get("date_start") || "").trim();
    const end = (url.searchParams.get("end") || url.searchParams.get("date_end") || "").trim();

    const wh: string[] = [];
    const binds: any[] = [];
    if (type) {
      wh.push("t.tx_type=?");
      binds.push(type);
    }
    if (start) {
      wh.push("t.created_at>=?");
      binds.push(start);
    }
    if (end) {
      wh.push("t.created_at<=?");
      binds.push(end);
    }
    if (keyword) {
      const kw = buildKeywordWhere(keyword, {
        numericId: "t.id",
        exact: ["t.tx_no", "t.asset_code", "t.sn", "t.employee_no"],
        prefix: ["t.asset_code", "t.sn", "t.brand", "t.model", "t.employee_name", "t.department"],
        contains: ["t.remark", "t.employee_name", "t.department"],
      });
      if (kw.sql) {
        wh.push(kw.sql);
        binds.push(...kw.binds);
      }
    }
    const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";
    const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM monitor_tx t ${where}`).bind(...binds).first<any>();
    return Response.json({ ok: true, data: { total: Number(row?.c || 0) } });
  } catch (e: any) {
    return errorResponse(e);
  }
};
