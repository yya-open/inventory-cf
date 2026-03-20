import { requireAuth, errorResponse } from "../../_auth";
import { requireConfirm } from "../../_confirm";
import { ensureMonitorSchemaIfAllowed } from "../_monitor";
import { logAudit } from "../_audit";
import { recalcMonitorAssets } from "./_recalc";
import { syncSystemDictionaryUsageCounters } from '../services/system-dictionaries';

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const body = await request.json<any>().catch(() => ({} as any));
    requireConfirm(body, "删除", "二次确认不通过");

    const ids: number[] = Array.isArray(body?.ids)
      ? body.ids.map((x: any) => Number(x)).filter((x: any) => Number.isFinite(x) && x > 0)
      : Array.isArray(body?.entries)
      ? body.entries.map((e: any) => Number(e?.id)).filter((x: any) => Number.isFinite(x) && x > 0)
      : [];
    if (!ids.length) return Response.json({ ok: false, message: "请选择要删除的记录" }, { status: 400 });

    const q = `SELECT DISTINCT asset_id FROM monitor_tx WHERE id IN (${ids.map(() => "?").join(",")})`;
    const r = await env.DB.prepare(q).bind(...ids).all<any>();
    const assetIds = (r.results || []).map((x: any) => Number(x.asset_id)).filter((x: any) => x > 0);

    const del = await env.DB.prepare(`DELETE FROM monitor_tx WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).run();
    const deleted = Number((del as any)?.meta?.changes || 0);

    await recalcMonitorAssets(env.DB, assetIds);
    await syncSystemDictionaryUsageCounters(env.DB, ['department']);
    await logAudit(env.DB, request, actor, "MONITOR_TX_DELETE", "monitor_tx", null, { ids, deleted, asset_ids: [...new Set(assetIds)] });
    return Response.json({ ok: true, data: { deleted } });
  } catch (e: any) {
    return errorResponse(e);
  }
};
