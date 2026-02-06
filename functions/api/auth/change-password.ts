import { json, requireAuth, errorResponse } from "../../_auth";
import { verifyPassword, hashPassword } from "../../_password";

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
  const user = await requireAuth(env, request, "viewer");
  if (!env?.DB) return errorResponse(500, "缺少 D1 绑定：请在 Pages 绑定中添加 DB -> inventory_db");
  const { old_password, new_password } = await request.json<any>();
  const oldP = String(old_password || "");
  const newP = String(new_password || "");
  if (newP.length < 6) return json(false, null, "新密码至少 6 位", 400);

  const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id=?").bind(user.id).first<any>();
  if (!row) return json(false, null, "用户不存在", 404);

  const ok = await verifyPassword(oldP, row.password_hash);
  if (!ok) return json(false, null, "旧密码不正确", 400);

  const ph = await hashPassword(newP);
  await env.DB.prepare("UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?").bind(ph, user.id).run();
  return json(true);

  } catch (e: any) {
    return errorResponse(e);
  }
};
