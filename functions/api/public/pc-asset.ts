import { errorResponse } from "../../_auth";
import { publicAssetSubject, rateLimitPublic, resolvePublicAssetId } from "../services/public-assets";
import { getActiveInventoryBatch } from "../services/asset-inventory-batches";
import { ensurePcLatestStateTable } from '../services/pc-latest-state';

type Env = { DB: D1Database; JWT_SECRET: string };

let latestStateReady = false;
let latestStateReadyPending: Promise<void> | null = null;
let batchCache: { expiresAt: number; row: any | null } | null = null;
const BATCH_CACHE_TTL_MS = 3000;

async function ensureLatestStateReady(db: D1Database) {
  if (latestStateReady) return;
  if (latestStateReadyPending) return latestStateReadyPending;
  latestStateReadyPending = ensurePcLatestStateTable(db)
    .then(() => {
      latestStateReady = true;
    })
    .finally(() => {
      latestStateReadyPending = null;
    });
  return latestStateReadyPending;
}

async function getCachedActiveBatch(db: D1Database) {
  const now = Date.now();
  if (batchCache && batchCache.expiresAt > now) return batchCache.row;
  const row = await getActiveInventoryBatch(db, 'pc');
  batchCache = { row: row || null, expiresAt: now + BATCH_CACHE_TTL_MS };
  return batchCache.row;
}

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
    inventory_batch_active: Boolean(asset.inventory_batch_active),
    inventory_batch_name: asset.inventory_batch_name || null,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    const token = (url.searchParams.get("token") || "").trim();
    await rateLimitPublic(env.DB, request, "public_pc_asset", publicAssetSubject(url), token ? 10 : 20);
    const id = await resolvePublicAssetId({ env, request, kind: "pc", allowToken: true });
    await ensureLatestStateReady(env.DB);

    const asset = await env.DB.prepare(
      `
      SELECT
        a.id, a.brand, a.serial_no, a.model,
        a.manufacture_date, a.warranty_end, a.disk_capacity, a.memory_size,
        a.remark, a.status,
        s.current_employee_no AS last_employee_no,
        s.current_employee_name AS last_employee_name,
        s.current_department AS last_department,
        s.last_config_date,
        s.last_recycle_date
      FROM pc_assets a
      LEFT JOIN pc_asset_latest_state s ON s.asset_id = a.id
      WHERE a.id=?
      LIMIT 1
      `
    ).bind(id).first<any>();

    if (!asset) throw Object.assign(new Error("电脑台账不存在或已删除"), { status: 404 });
    const activeBatch = await getCachedActiveBatch(env.DB);
    return Response.json({
      ok: true,
      data: sanitizePcAsset({
        ...asset,
        inventory_batch_active: Boolean(activeBatch?.id),
        inventory_batch_name: activeBatch?.name || null,
      }),
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
