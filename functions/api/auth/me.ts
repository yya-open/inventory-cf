import { json, requireAuth, errorResponse } from "../../_auth";
import { getUserPermissionMap, getUserTemplateCode } from '../../_permissions';
import { getUserDataScope } from '../services/data-scope';

const PROFILE_CACHE_TTL_MS = 20_000;
const profileCache = new Map<string, { expiresAt: number; value?: any; pending?: Promise<any> }>();

function cacheKeyOf(user: { id: number; username?: string | null; role?: string | null }) {
  return `${Number(user.id || 0)}:${String(user.username || '')}:${String(user.role || '')}`;
}

async function buildProfile(db: D1Database, user: any) {
  const [permission_template_code, dataScope] = await Promise.all([
    getUserTemplateCode(db, user.id, user.role),
    getUserDataScope(db, user.id),
  ]);
  const permissions = await getUserPermissionMap(db, user.id, user.role, permission_template_code);
  return { ...user, permission_template_code, permissions, ...dataScope };
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "viewer");
    const cacheKey = cacheKeyOf(user);
    const now = Date.now();
    const cached = profileCache.get(cacheKey);
    if (cached?.value && cached.expiresAt > now) return json(true, { user: cached.value });
    if (cached?.pending) return json(true, { user: await cached.pending });
    const pending = buildProfile(env.DB, user).then((profile) => {
      profileCache.set(cacheKey, { value: profile, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
      return profile;
    }).finally(() => {
      const latest = profileCache.get(cacheKey);
      if (latest?.pending) latest.pending = undefined;
    });
    profileCache.set(cacheKey, { value: cached?.value, expiresAt: cached?.expiresAt || 0, pending });
    return json(true, { user: await pending });
  } catch (e: any) {
    return errorResponse(e);
  }
};
