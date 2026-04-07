import { requireAuth, errorResponse } from "../_auth";
import { ensurePcSchemaIfAllowed } from "./_pc";
import { toSqlRange } from "./_date";
import { buildKeywordWhere } from "./_search";

// GET /api/pc-inventory-log-count
// 仅用于统计 total：前端列表首屏用 fast=1 跳过 COUNT(*)，然后异步请求该接口补齐。
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    const t = (env as any).__timing;
    if (t?.measure) await t.measure("schema", () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    const action = (url.searchParams.get("action") || "").trim().toUpperCase();
    const issue_type = (url.searchParams.get("issue_type") || "").trim().toUpperCase();
    const keyword = (url.searchParams.get("keyword") || "").trim();
    const batchId = Number(url.searchParams.get("batch_id") || 0) || 0;
    const date_from = url.searchParams.get("date_from");
    const date_to = url.searchParams.get("date_to");

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
        exact: ["a.serial_no", "o.employee_no"],
        prefix: [
          "a.serial_no",
          "a.brand",
          "a.model",
          "o.employee_no",
          "o.employee_name",
          "o.department",
          "l.action",
          "l.issue_type",
          "l.ip",
        ],
        contains: ["a.remark", "l.remark", "o.employee_name", "o.department", "l.ua"],
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
    const sql = `
      WITH latest_out AS (
        SELECT asset_id, MAX(id) AS max_id
        FROM pc_out
        GROUP BY asset_id
      )
      SELECT COUNT(*) as c
      FROM pc_inventory_log l
      JOIN pc_assets a ON a.id = l.asset_id
      LEFT JOIN latest_out lo ON lo.asset_id = l.asset_id
      LEFT JOIN pc_out o ON o.id = lo.max_id
      ${where}
    `;

    const row = t?.measure
      ? await t.measure("count", async () => env.DB.prepare(sql).bind(...binds).first<any>())
      : await env.DB.prepare(sql).bind(...binds).first<any>();

    return Response.json({ ok: true, total: Number((row as any)?.c || 0) });
  } catch (e: any) {
    return errorResponse(e);
  }
};
