import { json, signJwt, errorResponse } from "../../_auth";
import { verifyPassword } from "../../_password";

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
  if (!env?.DB) return errorResponse(500, "缺少 D1 绑定：请在 Pages 绑定中添加 DB -> inventory_db");
  const { username, password } = await request.json<any>();
  const u = (username || "").trim();
  const p = String(password || "");
  if (!u || !p) return json(false, null, "请输入账号和密码", 400);

  const row = await env.DB.prepare(
    "SELECT id, username, password_hash, role, is_active, must_change_password FROM users WHERE username=?"
  ).bind(u).first<any>();

  if (!row || Number(row.is_active) !== 1) return json(false, null, "账号或密码错误", 401);

  const ok = await verifyPassword(p, row.password_hash);
  if (!ok) return json(false, null, "账号或密码错误", 401);

  const token = await signJwt({ sub: row.id, u: row.username, r: row.role }, env.JWT_SECRET, 7 * 24 * 3600);
  return json(true, { token, user: { id: row.id, username: row.username, role: row.role, must_change_password: row.must_change_password } });

  } catch (e: any) {
    return errorResponse(e);
  }
};
