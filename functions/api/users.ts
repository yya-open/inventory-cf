import { json, requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
import { hashPassword } from "../_password";
import { requireConfirm } from "../_confirm";

type Env = { DB: D1Database; JWT_SECRET: string };

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");
    const { results } = await env.DB
      .prepare("SELECT id, username, role, is_active, must_change_password, created_at FROM users ORDER BY id ASC")
      .all();
    return json(true, results);
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    const { username, password, role } = await request.json<any>();

    const u = String(username || "").trim();
    const p = String(password || "");
    const r = (role || "viewer") as any;

    if (!u) return json(false, null, "username 必填", 400);
    if (p.length < 6) return json(false, null, "密码至少 6 位", 400);
    if (!["admin", "operator", "viewer"].includes(r)) return json(false, null, "role 无效", 400);

    const ph = await hashPassword(p);

    let newId: number | null = null;
    try {
      const ins = await env.DB
        .prepare("INSERT INTO users (username, password_hash, role, is_active, must_change_password) VALUES (?,?,?,?,1)")
        .bind(u, ph, r, 1)
        .run();
      newId = Number((ins as any)?.meta?.last_row_id || 0) || null;
    } catch (e: any) {
      // Unique constraint on username
      return json(false, null, "用户名已存在", 400);
    }

    const created = newId
      ? await env.DB
          .prepare("SELECT id, username, role, is_active, must_change_password, created_at FROM users WHERE id=?")
          .bind(newId)
          .first<any>()
      : null;

    await logAudit(env.DB, request, actor, "USER_CREATE", "users", newId ?? u, { after: created ?? { username: u, role: r } });

    return json(true, created ?? { id: newId, username: u, role: r, is_active: 1, must_change_password: 1 });
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    const { id, role, is_active, reset_password } = await request.json<any>();

    const uid = Number(id);
    if (!uid) return json(false, null, "id 无效", 400);

    const target = await env.DB.prepare("SELECT id, username, role, is_active, must_change_password FROM users WHERE id=?").bind(uid).first<any>();
    if (!target) return json(false, null, "用户不存在", 404);

    // 禁止禁用自己（避免把自己踢出系统）
    if (uid === actor.id && typeof is_active !== "undefined" && !is_active) {
      return json(false, null, "禁止禁用自己账号", 400);
    }

    // 最后一个管理员保护：不允许把最后一个启用的 admin 降权或禁用
    const willRole = role ? String(role) : String(target.role);
    const willActive = typeof is_active !== "undefined" ? (is_active ? 1 : 0) : Number(target.is_active);

    const isTargetAdminNow = String(target.role) === "admin" && Number(target.is_active) === 1;
    const isTargetAdminAfter = willRole === "admin" && willActive === 1;

    if (isTargetAdminNow && !isTargetAdminAfter) {
      const cnt = await env.DB
        .prepare("SELECT COUNT(*) as c FROM users WHERE role='admin' AND is_active=1 AND id<>?")
        .bind(uid)
        .first<any>();
      if (Number(cnt?.c || 0) <= 0) {
        return json(false, null, "至少需要保留 1 个启用的管理员账号", 400);
      }
    }

    const before = target;

    const changes: any = {};
    if (reset_password) {
      const newP = String(reset_password);
      if (newP.length < 6) return json(false, null, "重置密码至少 6 位", 400);
      const ph = await hashPassword(newP);
      await env.DB.prepare("UPDATE users SET password_hash=?, must_change_password=1 WHERE id=?").bind(ph, uid).run();
      changes.reset_password = true;
      changes.must_change_password = 1;
    }
    if (role) {
      if (!["admin", "operator", "viewer"].includes(role)) return json(false, null, "role 无效", 400);
      await env.DB.prepare("UPDATE users SET role=? WHERE id=?").bind(role, uid).run();
      changes.role = role;
    }
    if (typeof is_active !== "undefined") {
      await env.DB.prepare("UPDATE users SET is_active=? WHERE id=?").bind(is_active ? 1 : 0, uid).run();
      changes.is_active = is_active ? 1 : 0;
    }

    const after = await env.DB
      .prepare("SELECT id, username, role, is_active, must_change_password, created_at FROM users WHERE id=?")
      .bind(uid)
      .first<any>();

    await logAudit(env.DB, request, actor, "USER_UPDATE", "users", uid, { before, after, changes });

    return json(true, after);
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    const { id, confirm } = await request.json<any>();

    const uid = Number(id);
    if (!uid) return json(false, null, "id 无效", 400);

    if (uid === actor.id) {
      return json(false, null, "禁止删除自己账号", 400);
    }

    const target = await env.DB.prepare("SELECT id, username, role, is_active FROM users WHERE id=?").bind(uid).first<any>();
    if (!target) return json(false, null, "用户不存在", 404);

    // Hard protection: require typing the exact username to confirm deletion
    requireConfirm({ confirm }, String(target.username), "二次确认不通过：请输入要删除的用户名");

    // 最后一个管理员保护（只对启用管理员生效）
    const isAdminActive = String(target.role) === "admin" && Number(target.is_active) === 1;
    if (isAdminActive) {
      const cnt = await env.DB
        .prepare("SELECT COUNT(*) as c FROM users WHERE role='admin' AND is_active=1 AND id<>?")
        .bind(uid)
        .first<any>();
      if (Number(cnt?.c || 0) <= 0) {
        return json(false, null, "至少需要保留 1 个启用的管理员账号", 400);
      }
    }

    await env.DB.prepare("DELETE FROM users WHERE id=?").bind(uid).run();
    await logAudit(env.DB, request, actor, "USER_DELETE", "users", uid, { before: target });

    return json(true);
  } catch (e: any) {
    return errorResponse(e);
  }
};
