import { json, requireAuth, errorResponse, signJwt, JWT_TTL_SECONDS } from "../../_auth";
import { verifyPassword, hashPassword } from "../../_password";
import { validatePassword } from "../../_password_policy";

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "viewer");
    const { old_password, new_password } = await request.json<any>();
    const oldP = String(old_password || "");
    const newP = String(new_password || "");
    const vp = validatePassword(newP);
    if (!vp.ok) return json(false, null, "新" + vp.msg.replace(/^密码/, "密码"), 400);

    const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id=?").bind(user.id).first<any>();
    if (!row) return json(false, null, "用户不存在", 404);

    const ok = await verifyPassword(oldP, row.password_hash);
    if (!ok) return json(false, null, "旧密码不正确", 400);

    const ph = await hashPassword(vp.password);

    // Increase token_version so all existing tokens become invalid immediately.
    await env.DB
      .prepare("UPDATE users SET password_hash=?, must_change_password=0, token_version=token_version+1 WHERE id=?")
      .bind(ph, user.id)
      .run();

    // Issue a new token for the current session so the user won't be kicked out.
    const tvRow = await env.DB.prepare("SELECT token_version, username, role FROM users WHERE id=?").bind(user.id).first<any>();
    const tv = Number(tvRow?.token_version || 0);
    (env as any).__refresh_token = await signJwt(
      { sub: user.id, u: tvRow?.username || user.username, r: tvRow?.role || user.role, tv },
      env.JWT_SECRET,
      JWT_TTL_SECONDS
    );

    return json(true);
  } catch (e: any) {
    return errorResponse(e);
  }
};
