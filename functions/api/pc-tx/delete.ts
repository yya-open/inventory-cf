import { errorResponse } from "../../_auth";
import { requirePermission } from "../_permissions";
import { requireConfirm } from "../../_confirm";
import { logAudit } from "../_audit";
import { ensurePcSchema } from "../_pc";
import { recalcPcAssetStatuses } from "./_recalc";

type Entry = { id: number; type: string };

function normTable(t: string) {
  const x = String(t || '').toUpperCase();
  if (x === 'IN') return 'pc_in';
  if (x === 'OUT') return 'pc_out';
  if (x === 'RETURN' || x === 'RECYCLE') return 'pc_recycle';
  if (x === 'SCRAP') return 'pc_scrap';
  return '';
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const actor = await requirePermission(env, request, "pcTx.delete");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    await ensurePcSchema(env.DB);

    const body = await request.json().catch(() => ({} as any));
    requireConfirm(body, "删除", "二次确认不通过");

    const entries: Entry[] = Array.isArray(body?.entries)
      ? body.entries.map((e:any) => ({ id: Number(e?.id), type: String(e?.type || '').toUpperCase() }))
          .filter((e:Entry) => Number.isFinite(e.id) && e.id > 0 && !!normTable(e.type))
      : [];
    if (!entries.length) return Response.json({ ok:false, message:"请选择要删除的记录" }, { status:400 });

    const groups: Record<string, number[]> = { pc_in: [], pc_out: [], pc_recycle: [], pc_scrap: [] };
    for (const e of entries) groups[normTable(e.type)].push(e.id);

    const assetIds: number[] = [];
    for (const [table, ids] of Object.entries(groups)) {
      if (!ids.length) continue;
      const q = `SELECT asset_id FROM ${table} WHERE id IN (${ids.map(()=>'?').join(',')})`;
      const r = await env.DB.prepare(q).bind(...ids).all<any>();
      for (const row of (r.results || [])) if (row?.asset_id) assetIds.push(Number(row.asset_id));
    }

    let deleted = 0;
    for (const [table, ids] of Object.entries(groups)) {
      if (!ids.length) continue;
      const q = `DELETE FROM ${table} WHERE id IN (${ids.map(()=>'?').join(',')})`;
      const r:any = await env.DB.prepare(q).bind(...ids).run();
      deleted += Number(r?.meta?.changes || 0);
    }

    await recalcPcAssetStatuses(env.DB, assetIds);
    await logAudit(env.DB, request, actor, "PC_TX_DELETE", "pc_tx", null, {
      count: entries.length,
      deleted,
      entries,
      asset_ids: [...new Set(assetIds)],
    });
    return Response.json({ ok:true, data:{ deleted } });
  } catch (e:any) {
    return errorResponse(e);
  }
};
