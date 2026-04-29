import { errorResponse } from "../../_auth";
import {
  insertPublicInventoryLog,
  parsePublicInventoryBody,
  publicAssetSubject,
  rateLimitPublic,
  resolvePublicAssetId,
} from "../services/public-assets";

type Env = { DB: D1Database; JWT_SECRET: string };
type TimingLike = { measure?: <T>(name: string, fn: () => Promise<T> | T) => Promise<T> } | null;
let tokenResolveCache: Map<string, { expiresAt: number; id: number }> = new Map();
const TOKEN_RESOLVE_CACHE_TTL_MS = 15_000;

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

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const timing = ((env as any).__timing || null) as TimingLike;

    const url = new URL(request.url);
    if (timing?.measure) {
      await timing.measure('public_pc_inventory_rate_limit', () => rateLimitPublic(env.DB, request, "public_pc_inventory", publicAssetSubject(url), 8));
    } else {
      await rateLimitPublic(env.DB, request, "public_pc_inventory", publicAssetSubject(url), 8);
    }
    const resolved = timing?.measure
      ? await timing.measure('public_pc_inventory_resolve_id', () => resolvePublicAssetIdCached(env, request))
      : await resolvePublicAssetIdCached(env, request);
    if (timing?.measure) {
      if (resolved.cacheHit) await timing.measure('public_pc_inventory_resolve_id_cache_hit', () => 1);
      else await timing.measure('public_pc_inventory_resolve_id_cache_miss', () => 1);
    }
    const assetId = resolved.id;
    const payload = timing?.measure
      ? await timing.measure('public_pc_inventory_parse_body', async () => parsePublicInventoryBody(await request.json().catch(() => ({}))))
      : parsePublicInventoryBody(await request.json().catch(() => ({})));

    if (timing?.measure) {
      await timing.measure('public_pc_inventory_insert_log', () => insertPublicInventoryLog(env.DB, "pc", assetId, payload.action, payload.issueType, payload.remark, request));
    } else {
      await insertPublicInventoryLog(env.DB, "pc", assetId, payload.action, payload.issueType, payload.remark, request);
    }
    if (timing?.measure) await timing.measure('public_pc_inventory_submit_ok', () => 1);
    return Response.json({ ok: true });
  } catch (e: any) {
    return errorResponse(e);
  }
};
