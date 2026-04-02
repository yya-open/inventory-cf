import { json, requireAuth, errorResponse } from "../../_auth";
import { getUserPermissionMap, getUserTemplateCode } from '../../_permissions';
import { getUserDataScope } from '../services/data-scope';

type MePayload = { user: any };
const ME_CACHE_TTL_MS = 30_000;
const meCache = new Map<number, { expiresAt: number; payload: MePayload }>();

function readCachedMe(userId: number) {
  const entry = meCache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    meCache.delete(userId);
    return null;
  }
  return entry.payload;
}

function writeCachedMe(userId: number, payload: MePayload) {
  meCache.set(userId, { expiresAt: Date.now() + ME_CACHE_TTL_MS, payload });
  return payload;
}

export function invalidateCachedMe(userId?: number | null) {
  if (typeof userId === 'number' && Number.isFinite(userId) && userId > 0) {
    meCache.delete(userId);
    return;
  }
  meCache.clear();
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "viewer");
    const cached = readCachedMe(user.id);
    if (cached) return json(true, cached);
    const permission_template_code = await getUserTemplateCode(env.DB, user.id, user.role);
    const permissions = await getUserPermissionMap(env.DB, user.id, user.role, permission_template_code);
    const dataScope = await getUserDataScope(env.DB, user.id);
    const payload = writeCachedMe(user.id, { user: { ...user, permission_template_code, permissions, ...dataScope } });
    return json(true, payload);
  } catch (e: any) {
    return errorResponse(e);
  }
};
