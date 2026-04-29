import { errorResponse } from "../../_auth";
import { publicAssetSubject, rateLimitPublic, resolvePublicAssetId } from "../services/public-assets";
import { getActiveInventoryBatch } from "../services/asset-inventory-batches";

type Env = { DB: D1Database; JWT_SECRET?: string };

type TimingLike = { measure?: <T>(name: string, fn: () => Promise<T> | T) => Promise<T> } | null;

let batchCache: { expiresAt: number; row: any | null } | null = null;
let tokenResolveCache: Map<string, { expiresAt: number; id: number }> = new Map();
let detailCache: Map<number, { expiresAt: number; payload: any }> = new Map();
const BATCH_CACHE_TTL_MS = 3000;
const TOKEN_RESOLVE_CACHE_TTL_MS = 15_000;
const DETAIL_CACHE_TTL_MS = 8_000;

async function getCachedActiveBatch(db: D1Database) {
  const now = Date.now();
  if (batchCache && batchCache.expiresAt > now) return batchCache.row;
  const row = await getActiveInventoryBatch(db, 'monitor');
  batchCache = { row: row || null, expiresAt: now + BATCH_CACHE_TTL_MS };
  return batchCache.row;
}

async function resolvePublicAssetIdCached(env: Env, request: Request) {
  const url = new URL(request.url);
  const token = String(url.searchParams.get('token') || '').trim();
  if (!token) {
    const id = await resolvePublicAssetId({ env, request, kind: 'monitor', allowToken: true });
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
  const id = await resolvePublicAssetId({ env, request, kind: 'monitor', allowToken: true });
  tokenResolveCache.set(token, { id, expiresAt: now + TOKEN_RESOLVE_CACHE_TTL_MS });
  return { id, cacheHit: false };
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
      await timing.measure('public_monitor_rate_limit', () => rateLimitPublic(env.DB, request, "public_monitor_asset", publicAssetSubject(url), token ? 10 : 20));
    } else {
      await rateLimitPublic(env.DB, request, "public_monitor_asset", publicAssetSubject(url), token ? 10 : 20);
    }
    const resolved = timing?.measure
      ? await timing.measure('public_monitor_resolve_id', () => resolvePublicAssetIdCached(env, request))
      : await resolvePublicAssetIdCached(env, request);
    if (timing?.measure) {
      if (resolved.cacheHit) await timing.measure('public_monitor_resolve_id_cache_hit', () => 1);
      else await timing.measure('public_monitor_resolve_id_cache_miss', () => 1);
    }
    const id = resolved.id;
    const cachedPayload = readDetailCache(id);
    if (cachedPayload) {
      if (timing?.measure) await timing.measure('public_monitor_detail_cache_hit', () => 1);
      return Response.json({ ok: true, data: cachedPayload });
    }
    if (timing?.measure) await timing.measure('public_monitor_detail_cache_miss', () => 1);

    const asset = timing?.measure
      ? await timing.measure('public_monitor_asset_query', () => env.DB.prepare(
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
      ).bind(id).first<any>())
      : await env.DB.prepare(
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
    const activeBatch = timing?.measure
      ? await timing.measure('public_monitor_active_batch', () => getCachedActiveBatch(env.DB))
      : await getCachedActiveBatch(env.DB);
    const payload = sanitizeMonitorAsset({
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
