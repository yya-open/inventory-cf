import { requireAuth, errorResponse } from "../../_auth";
import { ensurePcSchemaIfAllowed } from "../_pc";
import { toSqlRange } from "../_date";
import { buildKeywordWhere } from "../_search";

// GET /api/pc-inventory-log/list
// 电脑扫码盘点记录（pc_inventory_log）分页查询
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    const t = (env as any).__timing;
    if (t?.measure) await t.measure("schema", () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    const fast = (url.searchParams.get("fast") || "").trim() === "1";
    const action = (url.searchParams.get("action") || "").trim().toUpperCase(); // OK/ISSUE
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
        contains: [
          "a.remark",
          "l.remark",
          "o.employee_name",
          "o.department",
          "l.ua",
        ],
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
      // COUNT(*) uses a global latest_out join (may be slow on big tables, so usually front-end uses fast=1)
      const countSql = `
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
        ? await t.measure("count", async () => env.DB.prepare(countSql).bind(...binds).first<any>())
        : await env.DB.prepare(countSql).bind(...binds).first<any>();
      totalCount = Number((row as any)?.c || 0);
    }

    // PERF: page-first, then compute latest_out only for assets in the page
    const sql = `
      WITH page_l AS (
        SELECT l.id, l.asset_id, l.created_at
        FROM pc_inventory_log l
        JOIN pc_assets a ON a.id = l.asset_id
        LEFT JOIN (
          SELECT asset_id, MAX(id) AS max_id
          FROM pc_out
          GROUP BY asset_id
        ) lo0 ON lo0.asset_id = l.asset_id
        LEFT JOIN pc_out o ON o.id = lo0.max_id
        ${where}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ? OFFSET ?
      ),
      latest_out AS (
        SELECT asset_id, MAX(id) AS max_id
        FROM pc_out
        WHERE asset_id IN (SELECT DISTINCT asset_id FROM page_l)
        GROUP BY asset_id
      )
      SELECT
        l.id,
        l.asset_id,
        l.action,
        l.issue_type,
        l.remark,
        l.ip,
        l.ua,
        l.created_at,
        a.serial_no,
        a.brand,
        a.model,
        a.status,
        o.employee_no   AS last_employee_no,
        o.employee_name AS last_employee_name,
        o.department    AS last_department
      FROM pc_inventory_log l
      JOIN page_l p ON p.id = l.id
      JOIN pc_assets a ON a.id = l.asset_id
      LEFT JOIN latest_out lo ON lo.asset_id = l.asset_id
      LEFT JOIN pc_out o ON o.id = lo.max_id
      ORDER BY l.created_at DESC, l.id DESC
    `;

    const { results } = t?.measure
      ? await t.measure("query", async () => env.DB.prepare(sql).bind(...binds, pageSize, offset).all())
      : await env.DB.prepare(sql).bind(...binds, pageSize, offset).all();

    return Response.json({ ok: true, data: results, total: totalCount, page, pageSize });
  } catch (e: any) {
    return errorResponse(e);
  }
};
