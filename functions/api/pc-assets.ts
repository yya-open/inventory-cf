import { requireAuth, errorResponse } from "../_auth";
import { ensurePcSchema } from "./_pc";
import { buildKeywordWhere } from "./_search";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    await ensurePcSchema(env.DB);

    const url = new URL(request.url);
    const status = (url.searchParams.get("status") || "").trim(); // IN_STOCK/ASSIGNED/RECYCLED
    const keyword = (url.searchParams.get("keyword") || "").trim();

    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(200, Math.max(20, Number(url.searchParams.get("page_size") || 50)));
    const offset = (page - 1) * pageSize;

    const wh: string[] = [];
    const binds: any[] = [];

    if (status) {
      wh.push("a.status=?");
      binds.push(status);
    }

    if (keyword) {
      const kw = buildKeywordWhere(keyword, {
        numericId: "a.id",
        exact: ["a.serial_no"],
        prefix: ["a.serial_no", "a.brand", "a.model"],
        contains: ["a.brand", "a.model", "a.remark"],
      });
      if (kw.sql) {
        wh.push(kw.sql);
        binds.push(...kw.binds);
      }
    }

    const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";

    const totalRow = await env.DB.prepare(`SELECT COUNT(*) as c FROM pc_assets a ${where}`).bind(...binds).first<any>();

    // include latest out info for quick view
    const sql = `
      SELECT
        a.*,
        (
          SELECT o.employee_no
          FROM pc_out o
          WHERE o.asset_id=a.id
          ORDER BY o.id DESC
          LIMIT 1
        ) AS last_employee_no,
        (
          SELECT o.employee_name
          FROM pc_out o
          WHERE o.asset_id=a.id
          ORDER BY o.id DESC
          LIMIT 1
        ) AS last_employee_name,
        (
          SELECT o.department
          FROM pc_out o
          WHERE o.asset_id=a.id
          ORDER BY o.id DESC
          LIMIT 1
        ) AS last_department,
        (
          SELECT o.config_date
          FROM pc_out o
          WHERE o.asset_id=a.id
          ORDER BY o.id DESC
          LIMIT 1
        ) AS last_config_date,
        (
          SELECT r.recycle_date
          FROM pc_recycle r
          WHERE r.asset_id=a.id
          ORDER BY r.id DESC
          LIMIT 1
        ) AS last_recycle_date,
        (
          SELECT o.created_at
          FROM pc_out o
          WHERE o.asset_id=a.id
          ORDER BY o.id DESC
          LIMIT 1
        ) AS last_out_at,
        (
          SELECT i.created_at
          FROM pc_in i
          WHERE i.asset_id=a.id
          ORDER BY i.id DESC
          LIMIT 1
        ) AS last_in_at
      FROM pc_assets a
      ${where}
      ORDER BY a.id DESC
      LIMIT ? OFFSET ?
    `;

    const { results } = await env.DB.prepare(sql).bind(...binds, pageSize, offset).all();

    return Response.json({ ok: true, data: results, total: Number(totalRow?.c || 0), page, pageSize });
  } catch (e: any) {
    return errorResponse(e);
  }
};
