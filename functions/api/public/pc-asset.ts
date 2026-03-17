import { errorResponse } from "../../_auth";
import { publicAssetSubject, rateLimitPublic, resolvePublicAssetId } from "../services/public-assets";

type Env = { DB: D1Database; JWT_SECRET: string };

function sanitizePcAsset(asset: any) {
  return {
    id: asset.id,
    brand: asset.brand || null,
    model: asset.model || null,
    serial_no: asset.serial_no || null,
    manufacture_date: asset.manufacture_date || null,
    warranty_end: asset.warranty_end || null,
    disk_capacity: asset.disk_capacity || null,
    memory_size: asset.memory_size || null,
    status: asset.status || null,
    remark: asset.remark || null,
    last_employee_no: asset.last_employee_no || null,
    last_employee_name: asset.last_employee_name || null,
    last_department: asset.last_department || null,
    last_config_date: asset.last_config_date || null,
    last_recycle_date: asset.last_recycle_date || null,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    const token = (url.searchParams.get("token") || "").trim();
    await rateLimitPublic(env.DB, request, "public_pc_asset", publicAssetSubject(url), token ? 10 : 20);
    const id = await resolvePublicAssetId({ env, request, kind: "pc", allowToken: true });

    const asset = await env.DB.prepare(
      `
      WITH latest_out AS (
        SELECT asset_id, MAX(id) AS max_id
        FROM pc_out
        WHERE asset_id=?
        GROUP BY asset_id
      ),
      latest_recycle AS (
        SELECT asset_id, MAX(id) AS max_id
        FROM pc_recycle
        WHERE asset_id=?
        GROUP BY asset_id
      )
      SELECT
        a.id, a.brand, a.serial_no, a.model,
        a.manufacture_date, a.warranty_end, a.disk_capacity, a.memory_size,
        a.remark, a.status,
        o.employee_no AS last_employee_no,
        o.employee_name AS last_employee_name,
        o.department AS last_department,
        o.config_date AS last_config_date,
        r.recycle_date AS last_recycle_date
      FROM pc_assets a
      LEFT JOIN latest_out lo ON lo.asset_id = a.id
      LEFT JOIN pc_out o ON o.id = lo.max_id
      LEFT JOIN latest_recycle lr ON lr.asset_id = a.id
      LEFT JOIN pc_recycle r ON r.id = lr.max_id
      WHERE a.id=?
      LIMIT 1
      `
    ).bind(id, id, id).first<any>();

    if (!asset) throw Object.assign(new Error("电脑台账不存在或已删除"), { status: 404 });
    return Response.json({ ok: true, data: sanitizePcAsset(asset) });
  } catch (e: any) {
    return errorResponse(e);
  }
};
