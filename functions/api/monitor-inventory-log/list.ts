import { requireAuth, errorResponse } from "../../_auth";
import { ensureMonitorSchemaIfAllowed } from "../_monitor";
import { toSqlRange } from "../_date";
import { buildKeywordWhere } from "../_search";

// GET /api/monitor-inventory-log/list
// 显示器扫码盘点记录（monitor_inventory_log）分页查询
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    const t = (env as any).__timing;
    if (t?.measure) await t.measure("schema", () => ensureMonitorSchemaIfAllowed(env.DB, env, url));
    else await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const fast = (url.searchParams.get("fast") || "").trim() === "1";
    const action = (url.searchParams.get("action") || "").trim().toUpperCase();
    const issue_type = (url.searchParams.get("issue_type") || "").trim().toUpperCase();
    const keyword = (url.searchParams.get("keyword") || "").trim();
    const date_from = url.searchParams.get("date_from");
    const date_to = url.searchParams.get("date_to");

    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(200, Math.max(20, Number(url.searchParams.get("page_size") || 50)));
    const offset = (page - 1) * pageSize;

    const wh: string[] = [];
    const binds: any[] = [];

    if (action === "OK" || action === "ISSUE") {
      wh.push("l.action=?");
      binds.push(action);
    }
    if (issue_type) {
      wh.push("l.issue_type=?");
      binds.push(issue_type);
    }

    if (keyword) {
      const kw = buildKeywordWhere(keyword, {
        numericId: "l.id",
        exact: ["a.asset_code", "a.sn", "a.employee_no"],
        prefix: [
          "a.asset_code",
          "a.sn",
          "a.brand",
          "a.model",
          "a.size_inch",
          "a.employee_no",
          "a.employee_name",
          "a.department",
          "l.action",
          "l.issue_type",
          "loc.name",
        ],
        contains: ["a.remark", "l.remark", "l.ua"],
      });
      if (kw.sql) {
        wh.push(kw.sql);
        binds.push(...kw.binds);
      }
    }

    const fromSql = toSqlRange(date_from, false);
    const toSql = toSqlRange(date_to, true);
    if (fromSql) {
      wh.push("l.created_at >= ?");
      binds.push(fromSql);
    }
    if (toSql) {
      wh.push("l.created_at <= ?");
      binds.push(toSql);
    }

    const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";

    let totalCount: number | null = null;
    if (!fast) {
      const countSql = `
        SELECT COUNT(*) as c
        FROM monitor_inventory_log l
        JOIN monitor_assets a ON a.id = l.asset_id
        LEFT JOIN pc_locations loc ON loc.id = a.location_id
        ${where}
      `;
      const row = t?.measure
        ? await t.measure("count", async () => env.DB.prepare(countSql).bind(...binds).first<any>())
        : await env.DB.prepare(countSql).bind(...binds).first<any>();
      totalCount = Number((row as any)?.c || 0);
    }

    const sql = `
      SELECT
        l.id,
        l.asset_id,
        l.action,
        l.issue_type,
        l.remark,
        l.ip,
        l.ua,
        l.created_at,
        a.asset_code,
        a.sn,
        a.brand,
        a.model,
        a.size_inch,
        a.status,
        loc.name AS location_name,
        a.employee_no,
        a.employee_name,
        a.department
      FROM monitor_inventory_log l
      JOIN monitor_assets a ON a.id = l.asset_id
      LEFT JOIN pc_locations loc ON loc.id = a.location_id
      ${where}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ? OFFSET ?
    `;

    const { results } = t?.measure
      ? await t.measure("query", async () => env.DB.prepare(sql).bind(...binds, pageSize, offset).all())
      : await env.DB.prepare(sql).bind(...binds, pageSize, offset).all();

    return Response.json({ ok: true, data: results, total: totalCount, page, pageSize });
  } catch (e: any) {
    return errorResponse(e);
  }
};
