import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
import { ensurePcSchemaIfAllowed } from './_pc';
import { latestPcOutRowSql, parseArchiveMeta, parseOwnerInput, pcAssetBulkOwnerSql, pcAssetBulkStatusSql } from './services/asset-ledger';
import { archiveAsset, restoreAsset } from './services/asset-archive';

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
      const meta = parseArchiveMeta(body);
      let archived = 0;
      for (const id of ids) {
        const row = await env.DB.prepare('SELECT id FROM pc_assets WHERE id=?').bind(id).first<any>();
        if (!row) continue;
        await archiveAsset(env.DB, 'pc', id, user.username || null, meta.reason, meta.note || null);
        archived += 1;
      }
      await logAudit(env.DB, request, user, 'PC_ASSET_ARCHIVE_BATCH', 'pc_assets', String(ids.length), { ids, count: archived, reason: meta.reason, note: meta.note });
      return Response.json({ ok: true, archived, message: `已归档 ${archived} 台电脑` });
    }

    if (action === 'restore') {
      let restored = 0;
      for (const id of ids) {
        const row = await env.DB.prepare('SELECT id FROM pc_assets WHERE id=? AND COALESCE(archived,0)=1').bind(id).first<any>();
        if (!row) continue;
        await restoreAsset(env.DB, 'pc', id);
        restored += 1;
      }
      await logAudit(env.DB, request, user, 'PC_ASSET_RESTORE_BATCH', 'pc_assets', String(ids.length), { ids, count: restored });
      return Response.json({ ok: true, restored, message: `已恢复 ${restored} 台电脑` });
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

    if (action === 'owner') {
      const owner = parseOwnerInput(body);
      let changed = 0;
      let skipped = 0;
      for (const id of ids) {
        const asset = await env.DB.prepare("SELECT id, status FROM pc_assets WHERE id=? AND COALESCE(archived,0)=0").bind(id).first<any>();
        if (!asset || String(asset.status) !== 'ASSIGNED') {
          skipped += 1;
          continue;
        }
        const outRow = await env.DB.prepare(latestPcOutRowSql()).bind(id).first<any>();
        if (!outRow?.id) {
          skipped += 1;
          continue;
        }
        await env.DB.prepare(pcAssetBulkOwnerSql()).bind(owner.employee_no, owner.department, owner.employee_name, outRow.id).run();
        changed += 1;
      }
      await logAudit(env.DB, request, user, 'PC_ASSET_OWNER_BATCH', 'pc_assets', String(ids.length), { ids, employee_name: owner.employee_name, employee_no: owner.employee_no, department: owner.department, count: changed, skipped });
      return Response.json({ ok: true, changed, skipped, message: skipped ? `已更新 ${changed} 台电脑领用人，跳过 ${skipped} 台非已领用电脑` : `已更新 ${changed} 台电脑领用人` });
    }

    throw Object.assign(new Error('不支持的批量操作'), { status: 400 });
  } catch (error: any) {
    return errorResponse(error);
  }
};
