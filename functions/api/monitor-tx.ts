import { requireAuth, errorResponse } from "../_auth";
import { ensureMonitorSchemaIfAllowed } from "./_monitor";
import { buildKeywordWhere } from "./_search";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const fast = (url.searchParams.get("fast") || "").trim() === "1";
    const type = (url.searchParams.get("type") || url.searchParams.get("tx_type") || "").trim().toUpperCase();
    const keyword = (url.searchParams.get("keyword") || "").trim();
    const start = (url.searchParams.get("start") || url.searchParams.get("date_start") || "").trim();
    const end = (url.searchParams.get("end") || url.searchParams.get("date_end") || "").trim();

    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(200, Math.max(20, Number(url.searchParams.get("page_size") || 50)));
    const offset = (page - 1) * pageSize;

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

    let totalCount: number | null = null;
    if (!fast) {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM monitor_tx t ${where}`).bind(...binds).first<any>();
      totalCount = Number(row?.c || 0);
    }

    const sql = `
      SELECT
        t.id,
        t.tx_no,
        t.tx_type,
        t.asset_id,
        t.asset_code,
        t.sn,
        t.brand,
        t.model,
        t.size_inch,
        t.employee_no,
        t.employee_name,
        t.department,
        t.is_employed,
        t.remark,
        t.created_at,
        t.created_by,
        fl.name AS from_location_name,
        tl.name AS to_location_name,
        fp.name AS from_parent_location_name,
        tp.name AS to_parent_location_name
      FROM monitor_tx t
      LEFT JOIN pc_locations fl ON fl.id = t.from_location_id
      LEFT JOIN pc_locations tl ON tl.id = t.to_location_id
      LEFT JOIN pc_locations fp ON fp.id = fl.parent_id
      LEFT JOIN pc_locations tp ON tp.id = tl.parent_id
      ${where}
      ORDER BY t.id DESC
      LIMIT ? OFFSET ?
    `;
    const { results } = await env.DB.prepare(sql).bind(...binds, pageSize, offset).all();
    return Response.json({ ok: true, data: results, total: totalCount, page, pageSize });
  } catch (e: any) {
    return errorResponse(e);
  }
};
