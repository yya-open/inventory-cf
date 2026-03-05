import { requireAuth, errorResponse } from "../../_auth";
import { requireConfirm } from "../../_confirm";
import { logAudit } from "../_audit";
import { ensurePcSchemaIfAllowed } from "../_pc";

// POST /api/pc-inventory-log/delete
// Admin-only. Deletes pc_inventory_log rows by id(s).
export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const url = new URL(request.url);
    const t = (env as any).__timing;
    if (t?.measure) await t.measure("schema", () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    const body: any = await request.json().catch(() => ({}));
    const idsRaw = body?.ids ?? (body?.id !== undefined ? [body.id] : []);
    const ids = Array.isArray(idsRaw)
      ? idsRaw.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0)
      : [];

    requireConfirm(body, "删除", "二次确认不通过");

    if (!ids.length) return Response.json({ ok: false, message: "缺少 id" }, { status: 400 });
    if (ids.length > 200) return Response.json({ ok: false, message: "一次最多删除 200 条" }, { status: 400 });

    const placeholders = ids.map(() => "?").join(",");
    const r = await env.DB.prepare(`DELETE FROM pc_inventory_log WHERE id IN (${placeholders})`).bind(...ids).run();
    const deleted = Number((r as any)?.meta?.changes ?? (r as any)?.changes ?? 0);

    waitUntil(
      logAudit(env.DB, request, actor, "pc_inventory_log_delete", "pc_inventory_log", null, {
        ids,
        deleted,
      }).catch(() => {})
    );

    return Response.json({ ok: true, data: { deleted } });
  } catch (e: any) {
    return errorResponse(e);
  }
};
