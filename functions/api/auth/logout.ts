import { buildClearAuthCookie, json, requireAuth, errorResponse, invalidateCachedAuthUser } from "../../_auth";

import { invalidateCachedMe } from "./me";

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "viewer");
    await env.DB.prepare("UPDATE users SET token_version=token_version+1 WHERE id=?").bind(user.id).run();
    invalidateCachedAuthUser(user.id);
    await invalidateCachedMe(env.DB, user.id, 'auth_logout', (env as any).__timing);
    (env as any).__refresh_token = null;
    (env as any).__clear_auth_cookie = true;
    const res = json(true);
    res.headers.append("Set-Cookie", buildClearAuthCookie());
    return res;
  } catch (e: any) {
    return errorResponse(e);
  }
};
