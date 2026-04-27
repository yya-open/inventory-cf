import { errorResponse } from "../../_auth";
import { publicAssetSubject, rateLimitPublic, resolvePublicAssetId } from "../services/public-assets";
import { getActiveInventoryBatch } from "../services/asset-inventory-batches";

type Env = { DB: D1Database; JWT_SECRET?: string };

let batchCache: { expiresAt: number; row: any | null } | null = null;
const BATCH_CACHE_TTL_MS = 3000;

async function getCachedActiveBatch(db: D1Database) {
  const now = Date.now();
  if (batchCache && batchCache.expiresAt > now) return batchCache.row;
  const row = await getActiveInventoryBatch(db, 'monitor');
  batchCache = { row: row || null, expiresAt: now + BATCH_CACHE_TTL_MS };
  return batchCache.row;
}

function sanitizeMonitorAsset(asset: any) {
  return {
    id: asset.id,
    asset_code: asset.asset_code || null,
    sn: asset.sn || null,
    brand: asset.brand || null,
    model: asset.model || null,
    size_inch: asset.size_inch || null,
    status: asset.status || null,
    location_name: asset.location_name || null,
    parent_location_name: asset.parent_location_name || null,
    department: asset.department || null,
    employee_no: asset.employee_no || null,
    employee_name: asset.employee_name || null,
    is_employed: asset.is_employed ?? null,
    remark: asset.remark || null,
    inventory_batch_active: Boolean(asset.inventory_batch_active),
    inventory_batch_name: asset.inventory_batch_name || null,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    const token = (url.searchParams.get("token") || "").trim();
    await rateLimitPublic(env.DB, request, "public_monitor_asset", publicAssetSubject(url), token ? 10 : 20);
    const id = await resolvePublicAssetId({ env, request, kind: "monitor", allowToken: true });

    const asset = await env.DB.prepare(
      `
      SELECT
        a.id, a.asset_code, a.sn, a.brand, a.model, a.size_inch, a.remark, a.status,
        a.department, a.employee_no, a.employee_name, a.is_employed,
        l.name AS location_name,
        p.name AS parent_location_name
      FROM monitor_assets a
      LEFT JOIN pc_locations l ON l.id = a.location_id
      LEFT JOIN pc_locations p ON p.id = l.parent_id
      WHERE a.id=?
      LIMIT 1
      `
    ).bind(id).first<any>();

    if (!asset) throw Object.assign(new Error("显示器台账不存在或已删除"), { status: 404 });
    const activeBatch = await getCachedActiveBatch(env.DB);
    return Response.json({
      ok: true,
      data: sanitizeMonitorAsset({
        ...asset,
        inventory_batch_active: Boolean(activeBatch?.id),
        inventory_batch_name: activeBatch?.name || null,
      }),
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
