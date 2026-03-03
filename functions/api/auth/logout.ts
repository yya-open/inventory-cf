import { json, requireAuth, errorResponse } from "../../_auth";

// POST /api/auth/logout
// Server-side logout by bumping token_version so current token is invalidated immediately.
export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "viewer");
    await env.DB.prepare("UPDATE users SET token_version=token_version+1 WHERE id=?").bind(user.id).run();
    // Do not refresh token here; frontend should clear local token.
    (env as any).__refresh_token = null;
    return json(true);
  } catch (e: any) {
    return errorResponse(e);
  }
};
