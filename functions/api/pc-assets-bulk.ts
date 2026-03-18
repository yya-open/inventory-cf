import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
import { ensurePcSchemaIfAllowed } from './_pc';
import { pcAssetArchiveSql, pcAssetBulkStatusSql } from './services/asset-ledger';

const ALLOWED_STATUS = new Set(['IN_STOCK', 'RECYCLED', 'SCRAPPED']);

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, 'admin');
    const url = new URL(request.url);
    await ensurePcSchemaIfAllowed(env.DB, env, url);
    const body = await request.json<any>().catch(() => ({} as any));
    const action = String(body?.action || '').trim();
    const ids = Array.isArray(body?.ids) ? body.ids.map((v: any) => Number(v)).filter((v: number) => v > 0) : [];
    if (!ids.length) throw Object.assign(new Error('请选择至少一条电脑台账'), { status: 400 });

    if (action === 'archive') {
      let archived = 0;
      for (const id of ids) {
        const row = await env.DB.prepare('SELECT id FROM pc_assets WHERE id=?').bind(id).first<any>();
        if (!row) continue;
        await env.DB.prepare(pcAssetArchiveSql()).bind(id).run();
        archived += 1;
      }
      await logAudit(env.DB, request, user, 'PC_ASSET_ARCHIVE_BATCH', 'pc_assets', String(ids.length), { ids, count: archived });
      return Response.json({ ok: true, archived, message: `已归档 ${archived} 台电脑` });
    }

    if (action === 'status') {
      const status = String(body?.status || '').trim();
      if (!ALLOWED_STATUS.has(status)) throw Object.assign(new Error('不支持的目标状态'), { status: 400 });
      let changed = 0;
      for (const id of ids) {
        const row = await env.DB.prepare('SELECT id FROM pc_assets WHERE id=? AND COALESCE(archived,0)=0').bind(id).first<any>();
        if (!row) continue;
        await env.DB.prepare(pcAssetBulkStatusSql()).bind(status, id).run();
        changed += 1;
      }
      await logAudit(env.DB, request, user, 'PC_ASSET_STATUS_BATCH', 'pc_assets', String(ids.length), { ids, status, count: changed });
      return Response.json({ ok: true, changed, message: `已更新 ${changed} 台电脑状态` });
    }

    throw Object.assign(new Error('不支持的批量操作'), { status: 400 });
  } catch (error: any) {
    return errorResponse(error);
  }
};
