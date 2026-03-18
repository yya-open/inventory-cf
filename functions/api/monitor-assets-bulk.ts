import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
import { ensureMonitorSchemaIfAllowed } from './_monitor';
import { monitorAssetArchiveSql, monitorAssetBulkLocationSql, monitorAssetBulkOwnerSql, monitorAssetBulkStatusSql, monitorAssetRestoreSql, parseArchiveMeta, parseOwnerInput } from './services/asset-ledger';

const ALLOWED_STATUS = new Set(['IN_STOCK', 'RECYCLED', 'SCRAPPED']);

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, 'admin');
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);
    const body = await request.json<any>().catch(() => ({} as any));
    const action = String(body?.action || '').trim();
    const ids = Array.isArray(body?.ids) ? body.ids.map((v: any) => Number(v)).filter((v: number) => v > 0) : [];
    if (!ids.length) throw Object.assign(new Error('请选择至少一条显示器台账'), { status: 400 });

    if (action === 'archive') {
      const meta = parseArchiveMeta(body);
      let archived = 0;
      for (const id of ids) {
        const row = await env.DB.prepare('SELECT id FROM monitor_assets WHERE id=?').bind(id).first<any>();
        if (!row) continue;
        await env.DB.prepare(monitorAssetArchiveSql()).bind(meta.reason, meta.note, user.username, id).run();
        archived += 1;
      }
      await logAudit(env.DB, request, user, 'MONITOR_ASSET_ARCHIVE_BATCH', 'monitor_assets', String(ids.length), { ids, count: archived, reason: meta.reason, note: meta.note });
      return Response.json({ ok: true, archived, message: `已归档 ${archived} 台显示器` });
    }

    if (action === 'restore') {
      let restored = 0;
      for (const id of ids) {
        const row = await env.DB.prepare('SELECT id FROM monitor_assets WHERE id=? AND COALESCE(archived,0)=1').bind(id).first<any>();
        if (!row) continue;
        await env.DB.prepare(monitorAssetRestoreSql()).bind(id).run();
        restored += 1;
      }
      await logAudit(env.DB, request, user, 'MONITOR_ASSET_RESTORE_BATCH', 'monitor_assets', String(ids.length), { ids, count: restored });
      return Response.json({ ok: true, restored, message: `已恢复 ${restored} 台显示器` });
    }

    if (action === 'status') {
      const status = String(body?.status || '').trim();
      if (!ALLOWED_STATUS.has(status)) throw Object.assign(new Error('不支持的目标状态'), { status: 400 });
      let changed = 0;
      for (const id of ids) {
        const row = await env.DB.prepare('SELECT id FROM monitor_assets WHERE id=? AND COALESCE(archived,0)=0').bind(id).first<any>();
        if (!row) continue;
        await env.DB.prepare(monitorAssetBulkStatusSql()).bind(status, status, status, status, id).run();
        changed += 1;
      }
      await logAudit(env.DB, request, user, 'MONITOR_ASSET_STATUS_BATCH', 'monitor_assets', String(ids.length), { ids, status, count: changed });
      return Response.json({ ok: true, changed, message: `已更新 ${changed} 台显示器状态` });
    }

    if (action === 'location') {
      const locationId = Number(body?.location_id || 0) || null;
      let changed = 0;
      for (const id of ids) {
        const row = await env.DB.prepare('SELECT id FROM monitor_assets WHERE id=? AND COALESCE(archived,0)=0').bind(id).first<any>();
        if (!row) continue;
        await env.DB.prepare(monitorAssetBulkLocationSql()).bind(locationId, id).run();
        changed += 1;
      }
      await logAudit(env.DB, request, user, 'MONITOR_ASSET_LOCATION_BATCH', 'monitor_assets', String(ids.length), { ids, location_id: locationId, count: changed });
      return Response.json({ ok: true, changed, message: `已更新 ${changed} 台显示器位置` });
    }

    if (action === 'owner') {
      const owner = parseOwnerInput(body);
      let changed = 0;
      for (const id of ids) {
        const row = await env.DB.prepare('SELECT id FROM monitor_assets WHERE id=? AND COALESCE(archived,0)=0').bind(id).first<any>();
        if (!row) continue;
        await env.DB.prepare(monitorAssetBulkOwnerSql()).bind(owner.employee_no, owner.department, owner.employee_name, id).run();
        changed += 1;
      }
      await logAudit(env.DB, request, user, 'MONITOR_ASSET_OWNER_BATCH', 'monitor_assets', String(ids.length), { ids, employee_name: owner.employee_name, employee_no: owner.employee_no, department: owner.department, count: changed });
      return Response.json({ ok: true, changed, message: `已更新 ${changed} 台显示器领用人` });
    }

    throw Object.assign(new Error('不支持的批量操作'), { status: 400 });
  } catch (error: any) {
    return errorResponse(error);
  }
};
