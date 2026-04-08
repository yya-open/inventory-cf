import { requireAuth, errorResponse } from "../_auth";
import { ensureMonitorSchemaIfAllowed } from "./_monitor";
import { toSqlRange } from "./_date";
import { buildKeywordWhere } from "./_search";

// GET /api/monitor-inventory-log-count
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const action = (url.searchParams.get("action") || "").trim().toUpperCase();
    const issue_type = (url.searchParams.get("issue_type") || "").trim().toUpperCase();
    const keyword = (url.searchParams.get("keyword") || "").trim();
    const batchId = Number(url.searchParams.get("batch_id") || 0) || 0;
    const date_from = url.searchParams.get("date_from");
    const date_to = url.searchParams.get("date_to");
    const groupBy = (url.searchParams.get("group_by") || '').trim().toLowerCase();

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
    if (batchId > 0) {
      wh.push("l.batch_id=?");
      binds.push(batchId);
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

    const fromSqlBase = `
      FROM monitor_inventory_log l
      JOIN monitor_assets a ON a.id = l.asset_id
      LEFT JOIN pc_locations loc ON loc.id = a.location_id
      ${where}
    `;

    if (groupBy === 'issue_type') {
      const sql = `
        SELECT COALESCE(NULLIF(TRIM(l.issue_type), ''), 'OTHER') AS issue_type, COUNT(*) as c
        ${fromSqlBase}
        GROUP BY COALESCE(NULLIF(TRIM(l.issue_type), ''), 'OTHER')
      `;
      const rows = await env.DB.prepare(sql).bind(...binds).all<any>();
      const breakdown: Record<string, number> = {};
      for (const row of Array.isArray(rows?.results) ? rows.results : []) {
        breakdown[String((row as any)?.issue_type || 'OTHER').toUpperCase()] = Number((row as any)?.c || 0);
      }
      const total = Object.values(breakdown).reduce((sum, value) => sum + Number(value || 0), 0);
      return Response.json({ ok: true, total, breakdown });
    }

    const sql = `SELECT COUNT(*) as c ${fromSqlBase}`;

    const row = await env.DB.prepare(sql).bind(...binds).first<any>();
    return Response.json({ ok: true, total: Number(row?.c || 0) });
  } catch (e: any) {
    return errorResponse(e);
  }
};
