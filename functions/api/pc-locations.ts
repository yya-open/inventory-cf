import { requireAuth, errorResponse } from "../_auth";
import { ensureMonitorSchemaIfAllowed } from "./_monitor";
import { must } from "./_pc";
import { logAudit } from "./_audit";
import { requireConfirm } from "../_confirm";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const enabled = (url.searchParams.get("enabled") || "").trim();
    const wh: string[] = [];
    const binds: any[] = [];
    if (enabled) {
      wh.push("enabled=?");
      binds.push(Number(enabled) ? 1 : 0);
    }
    const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";
    const { results } = await env.DB.prepare(`SELECT id, name, parent_id, enabled, created_at FROM pc_locations ${where} ORDER BY parent_id ASC, id ASC`).bind(...binds).all();
    return Response.json({ ok: true, data: results });
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "operator");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const body = await request.json<any>().catch(() => ({} as any));
    const name = must(body?.name, "位置名称", 120);
    const parent_id = Number(body?.parent_id || 0) || null;

    // prevent duplicates
    const dup = await env.DB
      .prepare("SELECT id FROM pc_locations WHERE name=? AND IFNULL(parent_id,0)=IFNULL(?,0)")
      .bind(name, parent_id)
      .first<any>();
    if (dup) throw Object.assign(new Error("该位置已存在"), { status: 400 });

    const res = await env.DB
      .prepare("INSERT INTO pc_locations (name, parent_id, enabled) VALUES (?,?,1)")
      .bind(name, parent_id)
      .run();

    await logAudit(env.DB, request, user, "PC_LOCATION_CREATE", "pc_locations", Number(res.meta.last_row_id || 0), { name, parent_id });
    return Response.json({ ok: true, message: "新增成功" });
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPut: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "operator");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const body = await request.json<any>().catch(() => ({} as any));
    const id = Number(body?.id || 0);
    if (!id) throw Object.assign(new Error("缺少位置ID"), { status: 400 });
    const old = await env.DB.prepare("SELECT * FROM pc_locations WHERE id=?").bind(id).first<any>();
    if (!old) throw Object.assign(new Error("位置不存在"), { status: 404 });

    const name = must(body?.name, "位置名称", 120);
    const enabled = Number(body?.enabled ?? old.enabled) ? 1 : 0;
    const parent_id = (Number(body?.parent_id || 0) || null) as any;

    if (parent_id && parent_id === id) throw Object.assign(new Error("父级位置不能是自己"), { status: 400 });

    const dup = await env.DB
      .prepare("SELECT id FROM pc_locations WHERE name=? AND IFNULL(parent_id,0)=IFNULL(?,0) AND id<>?")
      .bind(name, parent_id, id)
      .first<any>();
    if (dup) throw Object.assign(new Error("该位置已存在"), { status: 400 });

    await env.DB.prepare("UPDATE pc_locations SET name=?, parent_id=?, enabled=? WHERE id=?").bind(name, parent_id, enabled, id).run();
    await logAudit(env.DB, request, user, "PC_LOCATION_UPDATE", "pc_locations", id, { before: { name: old.name, parent_id: old.parent_id, enabled: old.enabled }, after: { name, parent_id, enabled } });
    return Response.json({ ok: true, message: "修改成功" });
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestDelete: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "admin");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const body = await request.json<any>().catch(() => ({} as any));
    requireConfirm(body, "删除", "二次确认不通过");
    const id = Number(body?.id || 0);
    if (!id) throw Object.assign(new Error("缺少位置ID"), { status: 400 });

    const used = await env.DB
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM monitor_assets WHERE location_id=?) AS m1,
          (SELECT COUNT(*) FROM monitor_tx WHERE from_location_id=? OR to_location_id=?) AS m2,
          (SELECT COUNT(*) FROM pc_locations WHERE parent_id=?) AS c
        `
      )
      .bind(id, id, id, id)
      .first<any>();
    if (Number(used?.m1 || 0) > 0 || Number(used?.m2 || 0) > 0 || Number(used?.c || 0) > 0) {
      throw Object.assign(new Error("该位置已被使用或存在子级位置，无法删除"), { status: 400 });
    }

    const old = await env.DB.prepare("SELECT * FROM pc_locations WHERE id=?").bind(id).first<any>();
    if (!old) throw Object.assign(new Error("位置不存在"), { status: 404 });

    await env.DB.prepare("DELETE FROM pc_locations WHERE id=?").bind(id).run();
    await logAudit(env.DB, request, user, "PC_LOCATION_DELETE", "pc_locations", id, { name: old.name, parent_id: old.parent_id });
    return Response.json({ ok: true, message: "删除成功" });
  } catch (e: any) {
    return errorResponse(e);
  }
};
