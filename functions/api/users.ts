import { json, requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
import { sqlNowStored } from "./_time";
import { hashPassword } from "../_password";
import { validatePassword } from "../_password_policy";
import { buildKeywordWhere } from "./_search";
import { ALL_PERMISSION_CODES, ALL_PERMISSION_TEMPLATE_CODES, getUserPermissionMap, getUserTemplateCode, normalizePermissionTemplateCode, setUserPermissionTemplate, setUserPermissions } from "../_permissions";
import { getUserDataScope, normalizeUserDataScope, setUserDataScope } from './services/data-scope';
import { assertDepartmentDictionaryValue, assertWarehouseDictionaryValue } from './services/master-data';

type Env = { DB: D1Database; JWT_SECRET: string };

async function assertScopeDictionaryConstraints(db: D1Database, type: any, value: any, value2: any) {
  const scope = normalizeUserDataScope(type, value, value2);
  if (scope.data_scope_type === 'department') await assertDepartmentDictionaryValue(db, scope.data_scope_value, '部门范围');
  if (scope.data_scope_type === 'warehouse') await assertWarehouseDictionaryValue(db, scope.data_scope_value, '仓库范围');
  if (scope.data_scope_type === 'department_warehouse') {
    await assertDepartmentDictionaryValue(db, scope.data_scope_value, '部门范围');
    await assertWarehouseDictionaryValue(db, scope.data_scope_value2, '仓库范围');
  }
  return scope;
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");
    const url = new URL(request.url);
    const keyword = (url.searchParams.get("keyword") || "").trim();

    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(200, Math.max(20, Number(url.searchParams.get("page_size") || 50)));
    const offset = (page - 1) * pageSize;

    const sortByRaw = (url.searchParams.get("sort_by") || "id").trim();
    const sortDirRaw = (url.searchParams.get("sort_dir") || "asc").trim().toLowerCase();
    const sortDir = sortDirRaw === "desc" ? "DESC" : "ASC";
    const sortMap: Record<string, string> = {
      id: "id",
      username: "username",
      role: "role",
      is_active: "is_active",
      created_at: "created_at",
    };
    const sortCol = sortMap[sortByRaw] || "id";
    const orderBy = `${sortCol} ${sortDir}, id ASC`;

    const kw = buildKeywordWhere(keyword, {
      numericId: "id",
      exact: ["username"],
      prefix: ["username"],
      contains: [],
    });
    const where = kw.sql ? `WHERE ${kw.sql}` : "";

    const totalRow = await env.DB.prepare(`SELECT COUNT(*) as c FROM users ${where}`).bind(...kw.binds).first<any>();
    const { results } = await env.DB
      .prepare(`SELECT id, username, role, is_active, must_change_password, created_at, permission_template_code, data_scope_type, data_scope_value, data_scope_value2 FROM users ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .bind(...kw.binds, pageSize, offset)
      .all();
    const rows = await Promise.all((results || []).map(async (row: any) => ({
      ...row,
      permission_template_code: normalizePermissionTemplateCode(row?.role || null, row?.permission_template_code),
      permissions: await getUserPermissionMap(env.DB, Number(row?.id || 0), row?.role || null, row?.permission_template_code || null),
      ...normalizeUserDataScope(row?.data_scope_type, row?.data_scope_value, row?.data_scope_value2),
      permission_codes: ALL_PERMISSION_CODES,
      permission_template_codes: ALL_PERMISSION_TEMPLATE_CODES,
    })));

    return Response.json({ ok: true, data: rows, total: Number(totalRow?.c || 0), page, pageSize, keyword_mode: kw.mode, sort_by: sortByRaw, sort_dir: sortDirRaw, permission_codes: ALL_PERMISSION_CODES, permission_template_codes: ALL_PERMISSION_TEMPLATE_CODES });
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    const { username, password, role, permissions, permission_template_code, data_scope_type, data_scope_value, data_scope_value2 } = await request.json<any>();

    const u = String(username || "").trim();
    const p = String(password || "");
    const r = (role || "viewer") as any;

    if (!u) return json(false, null, "username 必填", 400);
    const pv = validatePassword(p);
    if (!pv.ok) return json(false, null, pv.msg || "密码不符合规则", 400);
    if (!["admin", "operator", "viewer"].includes(r)) return json(false, null, "role 无效", 400);

    const ph = await hashPassword(pv.password);
    const validatedScope = await assertScopeDictionaryConstraints(env.DB, data_scope_type, data_scope_value, data_scope_value2);

    let newId: number | null = null;
    try {
      const ins = await env.DB
        .prepare(`INSERT INTO users (username, password_hash, role, is_active, must_change_password, created_at) VALUES (?,?,?,?,1, ${sqlNowStored()})`)
        .bind(u, ph, r, 1)
        .run();
      newId = Number((ins as any)?.meta?.last_row_id || 0) || null;
    } catch (e: any) {
      // Unique constraint on username
      return json(false, null, "用户名已存在", 400);
    }

    const created = newId
      ? await env.DB
          .prepare("SELECT id, username, role, is_active, must_change_password, created_at, permission_template_code, data_scope_type, data_scope_value, data_scope_value2 FROM users WHERE id=?")
          .bind(newId)
          .first<any>()
      : null;

    if (newId) {
      const template = await setUserPermissionTemplate(env.DB, newId, r, permission_template_code);
      const dataScope = await setUserDataScope(env.DB, newId, validatedScope.data_scope_type, validatedScope.data_scope_value, validatedScope.data_scope_value2);
      if (permissions && typeof permissions === 'object') await setUserPermissions(env.DB, newId, permissions, actor.username);
      if (created) Object.assign(created, { permission_template_code: template, ...dataScope });
    }
    const enriched = created ? { ...created, permissions: newId ? await getUserPermissionMap(env.DB, newId, r, created?.permission_template_code || null) : {}, ...(newId ? await getUserDataScope(env.DB, newId) : validatedScope) } : { id: newId, username: u, role: r, is_active: 1, must_change_password: 1, permission_template_code: normalizePermissionTemplateCode(r, permission_template_code), permissions: permissions || {}, ...validatedScope };
    await logAudit(env.DB, request, actor, "USER_CREATE", "users", newId ?? u, { after: enriched });

    return json(true, enriched);
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    const { id, role, is_active, reset_password, permissions, permission_template_code, data_scope_type, data_scope_value, data_scope_value2 } = await request.json<any>();

    const uid = Number(id);
    if (!uid) return json(false, null, "id 无效", 400);

    const target = await env.DB.prepare("SELECT id, username, role, is_active, must_change_password, permission_template_code, data_scope_type, data_scope_value, data_scope_value2 FROM users WHERE id=?").bind(uid).first<any>();
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
      const pv = validatePassword(newP);
      if (!pv.ok) return json(false, null, pv.msg || "密码不符合规则", 400);
      const ph = await hashPassword(pv.password);
      await env.DB.prepare("UPDATE users SET password_hash=?, must_change_password=1, token_version=COALESCE(token_version,0)+1 WHERE id=?").bind(ph, uid).run();
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
    const finalRole = role ? String(role) : String(target.role);
    if (typeof permission_template_code !== 'undefined') {
      const template = await setUserPermissionTemplate(env.DB, uid, finalRole, permission_template_code);
      changes.permission_template_code = template;
    }
    if (permissions && typeof permissions === 'object') {
      await setUserPermissions(env.DB, uid, permissions, actor.username);
      changes.permissions = permissions;
    }
    if (typeof data_scope_type !== 'undefined' || typeof data_scope_value !== 'undefined' || typeof data_scope_value2 !== 'undefined') {
      const validatedScope = await assertScopeDictionaryConstraints(env.DB, data_scope_type, data_scope_value, data_scope_value2);
      const scope = await setUserDataScope(env.DB, uid, validatedScope.data_scope_type, validatedScope.data_scope_value, validatedScope.data_scope_value2);
      changes.data_scope = scope;
    }

    const after = await env.DB
      .prepare("SELECT id, username, role, is_active, must_change_password, created_at, permission_template_code, data_scope_type, data_scope_value, data_scope_value2 FROM users WHERE id=?")
      .bind(uid)
      .first<any>();

    const enrichedAfter = { ...after, permission_template_code: await getUserTemplateCode(env.DB, uid, after?.role || target.role), permissions: await getUserPermissionMap(env.DB, uid, after?.role || target.role, after?.permission_template_code || null), ...(await getUserDataScope(env.DB, uid)) };
    await logAudit(env.DB, request, actor, "USER_UPDATE", "users", uid, { before, after: enrichedAfter, changes });

    return json(true, enrichedAfter);
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    const { id } = await request.json<any>();

    const uid = Number(id);
    if (!uid) return json(false, null, "id 无效", 400);

    if (uid === actor.id) {
      return json(false, null, "禁止删除自己账号", 400);
    }

    const target = await env.DB.prepare("SELECT id, username, role, is_active FROM users WHERE id=?").bind(uid).first<any>();
    if (!target) return json(false, null, "用户不存在", 404);

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
