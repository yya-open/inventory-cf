import { json, requireAuth, errorResponse } from "../_auth";
import { hashPassword } from "../_password";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
  await requireAuth(env, request, "admin");
  if (!env?.DB) return errorResponse(500, "缺少 D1 绑定：请在 Pages 绑定中添加 DB -> inventory_db");
  const { results } = await env.DB.prepare("SELECT id, username, role, is_active, must_change_password, created_at FROM users ORDER BY id ASC").all();
  return json(true, results);

  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
  await requireAuth(env, request, "admin");
  const { username, password, role } = await request.json<any>();
  const u = (username || "").trim();
  const p = String(password || "");
  const r = (role || "viewer") as any;
  if (!u) return json(false, null, "username 必填", 400);
  if (p.length < 6) return json(false, null, "密码至少 6 位", 400);
  if (!["admin","operator","viewer"].includes(r)) return json(false, null, "role 无效", 400);

  const ph = await hashPassword(p);
  try {
    await env.DB.prepare(
      "INSERT INTO users (username, password_hash, role, is_active, must_change_password) VALUES (?,?,?,?,1)"
    ).bind(u, ph, r, 1).run();
  } catch (e: any) {
    return json(false, null, "用户名已存在", 400);
  }
  return json(true);

  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPut: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
  await requireAuth(env, request, "admin");
  const { id, role, is_active, reset_password } = await request.json<any>();
  const uid = Number(id);
  if (!uid) return json(false, null, "id 无效", 400);

  if (reset_password) {
    const newP = String(reset_password);
    if (newP.length < 6) return json(false, null, "重置密码至少 6 位", 400);
    const ph = await hashPassword(newP);
    await env.DB.prepare("UPDATE users SET password_hash=?, must_change_password=1 WHERE id=?").bind(ph, uid).run();
  }
  if (role) {
    if (!["admin","operator","viewer"].includes(role)) return json(false, null, "role 无效", 400);
    await env.DB.prepare("UPDATE users SET role=? WHERE id=?").bind(role, uid).run();
  }
  if (typeof is_active !== "undefined") {
    await env.DB.prepare("UPDATE users SET is_active=? WHERE id=?").bind(is_active ? 1 : 0, uid).run();
  }

  return json(true);

  } catch (e: any) {
    return errorResponse(e);
  }
};
