import type { PagesFunction } from "@cloudflare/workers-types";
import { requireAuth } from "../_auth";
import { json } from "../_utils";
import { hashPassword, verifyPassword } from "../_crypto";
import { signJwt } from "../_jwt";

/**
 * Backward-compatible alias.
 * Old frontend calls: POST /api/change_password
 * New canonical route: POST /api/auth/change-password
 */
export const onRequestPost: PagesFunction = async (ctx) => {
  const auth = await requireAuth(ctx);
  if (!auth.ok) return auth.res;

  const { user } = auth;
  const body = await ctx.request.json().catch(() => ({} as any));
  const old_password = String(body.old_password || "");
  const new_password = String(body.new_password || "");

  if (!old_password || !new_password) return json(ctx, { ok: false, message: "参数缺失" }, 400);
  if (new_password.length < 6) return json(ctx, { ok: false, message: "新密码至少 6 位" }, 400);

  const db = ctx.env.DB;
  const row = await db.prepare("SELECT id, username, password_hash, token_version FROM users WHERE id=?").bind(user.id).first<any>();
  if (!row) return json(ctx, { ok: false, message: "用户不存在" }, 404);

  const ok = await verifyPassword(old_password, row.password_hash);
  if (!ok) return json(ctx, { ok: false, message: "原密码不正确" }, 400);

  const newHash = await hashPassword(new_password);
  await db.prepare("UPDATE users SET password_hash=?, must_change_password=0, token_version=COALESCE(token_version,0)+1 WHERE id=?")
    .bind(newHash, user.id).run();

  // Issue new token with bumped token_version (keep user logged in)
  const tv = (row.token_version ?? 0) + 1;
  const token = await signJwt({ sub: user.id, u: user.username, r: user.role, tv }, ctx.env.JWT_SECRET, 24 * 3600);

  const res = json(ctx, { ok: true, data: { token } });
  res.headers.set("X-Auth-Token", token);
  // Make sure frontend can read the header
  res.headers.set("Access-Control-Expose-Headers", "X-Auth-Token");
  return res;
};
