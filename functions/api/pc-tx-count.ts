import { requireAuth, errorResponse } from "../_auth";
import { ensurePcSchemaIfAllowed } from "./_pc";
import { toSqlRange } from "./_date";
import { buildKeywordWhere } from "./_search";
// Server-Timing is injected globally by functions/_middleware.ts

// 专门用于“只统计 total”的轻量接口：前端列表首屏可用 fast=1 跳过 COUNT(*)，
// 然后异步请求该接口补齐 total，显著提升首屏速度。
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const url = new URL(request.url);
    const t = (env as any).__timing;
    if (t?.measure) await t.measure("schema", () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    const type = (url.searchParams.get("type") || "").trim().toUpperCase(); // IN / OUT / RETURN / RECYCLE
    const keyword = (url.searchParams.get("keyword") || "").trim();
    const date_from = url.searchParams.get("date_from");
    const date_to = url.searchParams.get("date_to");

    const wh: string[] = [];
    const binds: any[] = [];

    if (["IN", "OUT", "RETURN", "RECYCLE"].includes(type)) {
      wh.push("x.type=?");
      binds.push(type);
    }

    if (keyword) {
      const kw = buildKeywordWhere(keyword, {
        numericId: "x.id",
        exact: ["x.tx_no", "x.serial_no", "x.employee_no"],
        prefix: ["x.tx_no", "x.serial_no", "x.brand", "x.model", "x.employee_no", "x.employee_name", "x.department"],
        contains: ["x.remark", "x.brand", "x.model", "x.employee_name", "x.department"],
      });
      if (kw.sql) {
        wh.push(kw.sql);
        binds.push(...kw.binds);
      }
    }

    const fromSql = toSqlRange(date_from, false);
    const toSql = toSqlRange(date_to, true);
    if (fromSql) {
      wh.push("x.created_at >= ?");
      binds.push(fromSql);
    }
    if (toSql) {
      wh.push("x.created_at <= ?");
      binds.push(toSql);
    }

    const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";

    const unionSql = `
      SELECT
        'IN' AS type,
        i.id AS id,
        i.in_no AS tx_no,
        i.asset_id,
        NULL AS employee_no,
        NULL AS department,
        NULL AS employee_name,
        NULL AS is_employed,
        i.brand, i.serial_no, i.model,
        NULL AS config_date,
        i.manufacture_date,
        i.warranty_end,
        i.disk_capacity,
        i.memory_size,
        i.remark,
        NULL AS recycle_date,
        i.created_at,
        i.created_by
      FROM pc_in i
      UNION ALL
      SELECT
        'OUT' AS type,
        o.id AS id,
        o.out_no AS tx_no,
        o.asset_id,
        o.employee_no,
        o.department,
        o.employee_name,
        o.is_employed,
        o.brand, o.serial_no, o.model,
        o.config_date,
        o.manufacture_date,
        o.warranty_end,
        o.disk_capacity,
        o.memory_size,
        o.remark,
        o.recycle_date,
        o.created_at,
        o.created_by
      FROM pc_out o
      UNION ALL
      SELECT
        r.action AS type,
        r.id AS id,
        r.recycle_no AS tx_no,
        r.asset_id,
        r.employee_no,
        r.department,
        r.employee_name,
        r.is_employed,
        r.brand, r.serial_no, r.model,
        NULL AS config_date,
        NULL AS manufacture_date,
        NULL AS warranty_end,
        NULL AS disk_capacity,
        NULL AS memory_size,
        r.remark,
        r.recycle_date,
        r.created_at,
        r.created_by
      FROM pc_recycle r
      UNION ALL
      SELECT
        'RECYCLE' AS type,
        s.id AS id,
        s.scrap_no AS tx_no,
        s.asset_id,
        NULL AS employee_no,
        NULL AS department,
        NULL AS employee_name,
        NULL AS is_employed,
        s.brand, s.serial_no, s.model,
        NULL AS config_date,
        s.manufacture_date,
        s.warranty_end,
        s.disk_capacity,
        s.memory_size,
        COALESCE(s.reason, s.remark) AS remark,
        s.scrap_date AS recycle_date,
        s.created_at,
        s.created_by
      FROM pc_scrap s
    `;

    const countSql = `SELECT COUNT(*) as c FROM ( ${unionSql} ) x ${where}`;
    const row = t?.measure
      ? await t.measure("count", async () => {
          return env.DB.prepare(countSql).bind(...binds).first<any>();
        })
      : await env.DB.prepare(countSql).bind(...binds).first<any>();

    return Response.json({ ok: true, total: Number((row as any)?.c || 0) });
  } catch (e: any) {
    return errorResponse(e);
  }
};
