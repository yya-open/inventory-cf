import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
import { ensureMonitorSchemaIfAllowed } from "./_monitor";
import { must, optional, normalizeText } from "./_pc";
import { buildKeywordWhere } from "./_search";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const fast = (url.searchParams.get("fast") || "").trim() === "1";
    const status = (url.searchParams.get("status") || "").trim();
    const locationId = Number(url.searchParams.get("location_id") || 0) || 0;
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

    let totalCount: number | null = null;
    if (!fast) {
      const totalRow = await env.DB.prepare(`SELECT COUNT(*) as c FROM monitor_assets a ${where}`).bind(...binds).first<any>();
      totalCount = Number((totalRow as any)?.c || 0);
    }

    const sql = `
      SELECT
        a.*,
        l.name AS location_name,
        p.name AS parent_location_name
      FROM monitor_assets a
      LEFT JOIN pc_locations l ON l.id = a.location_id
      LEFT JOIN pc_locations p ON p.id = l.parent_id
      ${where}
      ORDER BY a.id ASC
      LIMIT ? OFFSET ?
    `;
    const { results } = await env.DB.prepare(sql).bind(...binds, pageSize, offset).all();
    return Response.json({ ok: true, data: results, total: totalCount, page, pageSize });
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "operator");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const body = await request.json<any>().catch(() => ({} as any));
    const asset_code = must(body?.asset_code, "资产编号", 120);
    const sn = optional(body?.sn, 120);
    const brand = optional(body?.brand, 120);
    const model = optional(body?.model, 200);
    const size_inch = optional(body?.size_inch, 60);
    const remark = optional(body?.remark, 1000);
    const location_id = Number(body?.location_id || 0) || null;

    const dup = await env.DB.prepare("SELECT id FROM monitor_assets WHERE asset_code=?").bind(asset_code).first<any>();
    if (dup) throw Object.assign(new Error("资产编号已存在"), { status: 400 });

    const res = await env.DB
      .prepare(
        `INSERT INTO monitor_assets (asset_code, sn, brand, model, size_inch, remark, status, location_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?, 'IN_STOCK', ?, datetime('now','+8 hours'), datetime('now','+8 hours'))`
      )
      .bind(asset_code, sn, brand, model, size_inch, remark, location_id)
      .run();
    const id = Number(res.meta.last_row_id || 0);
    await logAudit(env.DB, request, user, "monitor_asset_create", "monitor_assets", id, { asset_code, sn, brand, model, size_inch, remark, location_id });
    return Response.json({ ok: true, message: "新增成功" });
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPut: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "admin");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const body = await request.json<any>().catch(() => ({} as any));
    const id = Number(body?.id || 0);
    if (!id) throw Object.assign(new Error("缺少资产ID"), { status: 400 });
    const old = await env.DB.prepare("SELECT * FROM monitor_assets WHERE id=?").bind(id).first<any>();
    if (!old) throw Object.assign(new Error("显示器台账不存在"), { status: 404 });

    const asset_code = must(body?.asset_code, "资产编号", 120);
    const sn = optional(body?.sn, 120);
    const brand = optional(body?.brand, 120);
    const model = optional(body?.model, 200);
    const size_inch = optional(body?.size_inch, 60);
    const remark = optional(body?.remark, 1000);
    const location_id = Number(body?.location_id || 0) || null;

    const dup = await env.DB.prepare("SELECT id FROM monitor_assets WHERE asset_code=? AND id<>?").bind(asset_code, id).first<any>();
    if (dup) throw Object.assign(new Error("资产编号已存在"), { status: 400 });

    await env.DB
      .prepare(
        `UPDATE monitor_assets
         SET asset_code=?, sn=?, brand=?, model=?, size_inch=?, remark=?, location_id=?, updated_at=datetime('now','+8 hours')
         WHERE id=?`
      )
      .bind(asset_code, sn, brand, model, size_inch, remark, location_id, id)
      .run();

    await logAudit(env.DB, request, user, "monitor_asset_update", "monitor_assets", id, {
      before: { asset_code: old.asset_code, sn: old.sn, brand: old.brand, model: old.model, size_inch: old.size_inch, remark: old.remark, location_id: old.location_id },
      after: { asset_code, sn, brand, model, size_inch, remark, location_id },
    });
    return Response.json({ ok: true, message: "修改成功" });
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestDelete: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "admin");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const body = await request.json<any>().catch(() => ({} as any));
    const id = Number(body?.id || 0);
    if (!id) throw Object.assign(new Error("缺少资产ID"), { status: 400 });

    const asset = await env.DB.prepare("SELECT * FROM monitor_assets WHERE id=?").bind(id).first<any>();
    if (!asset) throw Object.assign(new Error("显示器台账不存在"), { status: 404 });

    const ref = await env.DB.prepare("SELECT COUNT(*) AS c FROM monitor_tx WHERE asset_id=?").bind(id).first<any>();
    if (Number(ref?.c || 0) > 0) throw Object.assign(new Error("该资产已有出入库记录，为避免影响追溯，暂不允许删除"), { status: 400 });

    await env.DB.prepare("DELETE FROM monitor_assets WHERE id=?").bind(id).run();
    await logAudit(env.DB, request, user, "monitor_asset_delete", "monitor_assets", id, { asset_code: asset.asset_code });
    return Response.json({ ok: true, message: "删除成功" });
  } catch (e: any) {
    return errorResponse(e);
  }
};
