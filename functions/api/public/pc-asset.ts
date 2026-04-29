import { errorResponse } from "../../_auth";
import { publicAssetSubject, rateLimitPublic, resolvePublicAssetId } from "../services/public-assets";
import { getActiveInventoryBatch } from "../services/asset-inventory-batches";
import { ensurePcLatestStateTable } from '../services/pc-latest-state';

type Env = { DB: D1Database; JWT_SECRET: string };

type TimingLike = { measure?: <T>(name: string, fn: () => Promise<T> | T) => Promise<T> } | null;

let latestStateReady = false;
let latestStateReadyPending: Promise<void> | null = null;
let batchCache: { expiresAt: number; row: any | null } | null = null;
let tokenResolveCache: Map<string, { expiresAt: number; id: number }> = new Map();
let detailCache: Map<number, { expiresAt: number; payload: any }> = new Map();
const BATCH_CACHE_TTL_MS = 3000;
const TOKEN_RESOLVE_CACHE_TTL_MS = 15_000;
const DETAIL_CACHE_TTL_MS = 8_000;

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

async function resolvePublicAssetIdCached(env: Env, request: Request) {
  const url = new URL(request.url);
  const token = String(url.searchParams.get('token') || '').trim();
  if (!token) {
    const id = await resolvePublicAssetId({ env, request, kind: 'pc', allowToken: true });
    return { id, cacheHit: false };
  }
  const now = Date.now();
  const cached = tokenResolveCache.get(token);
  if (cached && cached.expiresAt > now) return { id: cached.id, cacheHit: true };
  if (tokenResolveCache.size > 500) {
    const next = new Map<string, { expiresAt: number; id: number }>();
    for (const [k, v] of tokenResolveCache) {
      if (v.expiresAt > now) next.set(k, v);
    }
    tokenResolveCache = next;
  }
  const id = await resolvePublicAssetId({ env, request, kind: 'pc', allowToken: true });
  tokenResolveCache.set(token, { id, expiresAt: now + TOKEN_RESOLVE_CACHE_TTL_MS });
  return { id, cacheHit: false };
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

function readDetailCache(id: number) {
  const cached = detailCache.get(id);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    detailCache.delete(id);
    return null;
  }
  return cached.payload;
}

function writeDetailCache(id: number, payload: any) {
  if (detailCache.size > 800) {
    const now = Date.now();
    const next = new Map<number, { expiresAt: number; payload: any }>();
    for (const [k, v] of detailCache) {
      if (v.expiresAt > now) next.set(k, v);
    }
    detailCache = next;
  }
  detailCache.set(id, { payload, expiresAt: Date.now() + DETAIL_CACHE_TTL_MS });
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const timing = ((env as any).__timing || null) as TimingLike;

    const url = new URL(request.url);
    const token = (url.searchParams.get("token") || "").trim();
    if (timing?.measure) {
      await timing.measure('public_pc_rate_limit', () => rateLimitPublic(env.DB, request, "public_pc_asset", publicAssetSubject(url), token ? 10 : 20));
    } else {
      await rateLimitPublic(env.DB, request, "public_pc_asset", publicAssetSubject(url), token ? 10 : 20);
    }
    const resolved = timing?.measure
      ? await timing.measure('public_pc_resolve_id', () => resolvePublicAssetIdCached(env, request))
      : await resolvePublicAssetIdCached(env, request);
    if (timing?.measure) {
      if (resolved.cacheHit) await timing.measure('public_pc_resolve_id_cache_hit', () => 1);
      else await timing.measure('public_pc_resolve_id_cache_miss', () => 1);
    }
    const id = resolved.id;
    if (timing?.measure) await timing.measure('public_pc_ensure_state', () => ensureLatestStateReady(env.DB));
    else await ensureLatestStateReady(env.DB);
    const cachedPayload = readDetailCache(id);
    if (cachedPayload) {
      if (timing?.measure) await timing.measure('public_pc_detail_cache_hit', () => 1);
      return Response.json({ ok: true, data: cachedPayload });
    }
    if (timing?.measure) await timing.measure('public_pc_detail_cache_miss', () => 1);

    const asset = timing?.measure
      ? await timing.measure('public_pc_asset_query', () => env.DB.prepare(
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
      ).bind(id).first<any>())
      : await env.DB.prepare(
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
    const activeBatch = timing?.measure
      ? await timing.measure('public_pc_active_batch', () => getCachedActiveBatch(env.DB))
      : await getCachedActiveBatch(env.DB);
    const payload = sanitizePcAsset({
      ...asset,
      inventory_batch_active: Boolean(activeBatch?.id),
      inventory_batch_name: activeBatch?.name || null,
    });
    writeDetailCache(id, payload);
    return Response.json({ ok: true, data: payload });
  } catch (e: any) {
    return errorResponse(e);
  }
};
