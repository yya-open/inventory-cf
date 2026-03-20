import { requireAuth, errorResponse } from '../_auth';
import { requirePermission } from '../_permissions';
import { logAudit } from './_audit';
import { ensureMonitorSchemaIfAllowed } from './_monitor';
import { parseArchiveMeta, parseOwnerInput } from './services/asset-ledger';
import {
  bulkArchiveAssets,
  bulkRestoreAssets,
  bulkUpdateMonitorLocation,
  bulkUpdateMonitorOwner,
  bulkUpdateMonitorStatus,
} from './services/asset-bulk';
import { invalidateSystemDictionaryReferenceCache, syncSystemDictionaryUsageCounters } from './services/system-dictionaries';

const ALLOWED_STATUS = new Set(['IN_STOCK', 'RECYCLED', 'SCRAPPED']);

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requirePermission(env, request, 'bulk_operation', 'admin');
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);
    const body = await request.json<any>().catch(() => ({} as any));
    const action = String(body?.action || '').trim();
    const ids = Array.isArray(body?.ids) ? body.ids.map((v: any) => Number(v)).filter((v: number) => v > 0) : [];
    if (!ids.length) throw Object.assign(new Error('请选择至少一条显示器台账'), { status: 400 });

    if (action === 'archive') {
      const meta = parseArchiveMeta(body);
      const result = await bulkArchiveAssets(env.DB, 'monitor', ids, meta.reason, meta.note || null, user.username || null);
      invalidateSystemDictionaryReferenceCache();
      await syncSystemDictionaryUsageCounters(env.DB, ['asset_archive_reason','department']);
      await logAudit(env.DB, request, user, 'MONITOR_ASSET_ARCHIVE_BATCH', 'monitor_assets', String(ids.length), {
        ids: result.ids,
        requested_ids: ids,
        count: result.changed,
        skipped: result.skipped,
        skipped_ids: result.skippedIds,
        reason: meta.reason,
        note: meta.note,
      });
      return Response.json({
        ok: true,
        archived: result.changed,
        skipped: result.skipped,
        message: result.skipped ? `已归档 ${result.changed} 台显示器，跳过 ${result.skipped} 台` : `已归档 ${result.changed} 台显示器`,
      });
    }

    if (action === 'restore') {
      const result = await bulkRestoreAssets(env.DB, 'monitor', ids);
      invalidateSystemDictionaryReferenceCache();
      await syncSystemDictionaryUsageCounters(env.DB, ['asset_archive_reason','department']);
      await logAudit(env.DB, request, user, 'MONITOR_ASSET_RESTORE_BATCH', 'monitor_assets', String(ids.length), {
        ids: result.ids,
        requested_ids: ids,
        count: result.changed,
        skipped: result.skipped,
        skipped_ids: result.skippedIds,
      });
      return Response.json({
        ok: true,
        restored: result.changed,
        skipped: result.skipped,
        message: result.skipped ? `已恢复 ${result.changed} 台显示器，跳过 ${result.skipped} 台` : `已恢复 ${result.changed} 台显示器`,
      });
    }

    if (action === 'status') {
      const status = String(body?.status || '').trim();
      if (!ALLOWED_STATUS.has(status)) throw Object.assign(new Error('不支持的目标状态'), { status: 400 });
      const result = await bulkUpdateMonitorStatus(env.DB, ids, status);
      await logAudit(env.DB, request, user, 'MONITOR_ASSET_STATUS_BATCH', 'monitor_assets', String(ids.length), {
        ids: result.ids,
        requested_ids: ids,
        status,
        count: result.changed,
        skipped: result.skipped,
        skipped_ids: result.skippedIds,
      });
      return Response.json({
        ok: true,
        changed: result.changed,
        skipped: result.skipped,
        message: result.skipped ? `已更新 ${result.changed} 台显示器状态，跳过 ${result.skipped} 台` : `已更新 ${result.changed} 台显示器状态`,
      });
    }

    if (action === 'location') {
      const locationId = Number(body?.location_id || 0) || null;
      const result = await bulkUpdateMonitorLocation(env.DB, ids, locationId);
      await logAudit(env.DB, request, user, 'MONITOR_ASSET_LOCATION_BATCH', 'monitor_assets', String(ids.length), {
        ids: result.ids,
        requested_ids: ids,
        location_id: locationId,
        count: result.changed,
        skipped: result.skipped,
        skipped_ids: result.skippedIds,
      });
      return Response.json({
        ok: true,
        changed: result.changed,
        skipped: result.skipped,
        message: result.skipped ? `已更新 ${result.changed} 台显示器位置，跳过 ${result.skipped} 台` : `已更新 ${result.changed} 台显示器位置`,
      });
    }

    if (action === 'owner') {
      const owner = parseOwnerInput(body);
      const result = await bulkUpdateMonitorOwner(env.DB, ids, owner);
      invalidateSystemDictionaryReferenceCache();
      await syncSystemDictionaryUsageCounters(env.DB, ['asset_archive_reason','department']);
      await logAudit(env.DB, request, user, 'MONITOR_ASSET_OWNER_BATCH', 'monitor_assets', String(ids.length), {
        ids: result.ids,
        requested_ids: ids,
        employee_name: owner.employee_name,
        employee_no: owner.employee_no,
        department: owner.department,
        count: result.changed,
        skipped: result.skipped,
        skipped_ids: result.skippedIds,
      });
      return Response.json({
        ok: true,
        changed: result.changed,
        skipped: result.skipped,
        message: result.skipped ? `已更新 ${result.changed} 台显示器领用人，跳过 ${result.skipped} 台` : `已更新 ${result.changed} 台显示器领用人`,
      });
    }

    throw Object.assign(new Error('不支持的批量操作'), { status: 400 });
  } catch (error: any) {
    return errorResponse(error);
  }
};
