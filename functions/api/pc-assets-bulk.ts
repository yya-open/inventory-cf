import { requireAuth, errorResponse } from '../_auth';
import { requirePermission } from '../_permissions';
import { logAudit } from './_audit';
import { ensurePcSchemaIfAllowed } from './_pc';
import { getSystemSettings } from './services/system-settings';
import { parseArchiveMeta, parseOwnerInput } from './services/asset-ledger';
import { bulkArchiveAssets, bulkRestoreAssets, bulkUpdatePcOwner, bulkUpdatePcStatus, loadAssetRows } from './services/asset-bulk';
import { bulkDeleteAssets } from './services/asset-bulk-delete';
import { invalidateSystemDictionaryReferenceCache, syncSystemDictionaryUsageCounters } from './services/system-dictionaries';
import { assertArchiveReasonDictionaryValue, assertDepartmentDictionaryValue } from './services/master-data';

const ALLOWED_STATUS = new Set(['IN_STOCK', 'RECYCLED', 'SCRAPPED']);

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requirePermission(env, request, 'bulk_operation', 'admin');
    const url = new URL(request.url);
    await ensurePcSchemaIfAllowed(env.DB, env, url);
    const body = await request.json<any>().catch(() => ({} as any));
    const action = String(body?.action || '').trim();
    const ids = Array.isArray(body?.ids) ? body.ids.map((v: any) => Number(v)).filter((v: number) => v > 0) : [];
    if (!ids.length) throw Object.assign(new Error('请选择至少一条电脑台账'), { status: 400 });

    if (action === 'archive') {
      const meta = parseArchiveMeta(body);
      await assertArchiveReasonDictionaryValue(env.DB, meta.reason, '归档原因');
      const result = await bulkArchiveAssets(env.DB, 'pc', ids, meta.reason, meta.note || null, user.username || null);
      invalidateSystemDictionaryReferenceCache();
      await syncSystemDictionaryUsageCounters(env.DB, ['asset_archive_reason','department']);
      await logAudit(env.DB, request, user, 'PC_ASSET_ARCHIVE_BATCH', 'pc_assets', String(ids.length), {
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
        message: result.skipped ? `已归档 ${result.changed} 台电脑，跳过 ${result.skipped} 台` : `已归档 ${result.changed} 台电脑`,
      });
    }

    if (action === 'restore') {
      const result = await bulkRestoreAssets(env.DB, 'pc', ids);
      invalidateSystemDictionaryReferenceCache();
      await syncSystemDictionaryUsageCounters(env.DB, ['asset_archive_reason','department']);
      await logAudit(env.DB, request, user, 'PC_ASSET_RESTORE_BATCH', 'pc_assets', String(ids.length), {
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
        message: result.skipped ? `已恢复 ${result.changed} 台电脑，跳过 ${result.skipped} 台` : `已恢复 ${result.changed} 台电脑`,
      });
    }

    if (action === 'status') {
      const status = String(body?.status || '').trim();
      if (!ALLOWED_STATUS.has(status)) throw Object.assign(new Error('不支持的目标状态'), { status: 400 });
      const result = await bulkUpdatePcStatus(env.DB, ids, status);
      await logAudit(env.DB, request, user, 'PC_ASSET_STATUS_BATCH', 'pc_assets', String(ids.length), {
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
        message: result.skipped ? `已更新 ${result.changed} 台电脑状态，跳过 ${result.skipped} 台` : `已更新 ${result.changed} 台电脑状态`,
      });
    }


    if (action === 'delete') {
      const existingRows = await loadAssetRows(env.DB, 'pc', ids);
      if (existingRows.some((row) => Number(row.archived || 0) === 1)) {
        await requirePermission(env, request, 'asset_purge', 'admin');
      }
      const settings = await getSystemSettings(env.DB);
      const result = await bulkDeleteAssets(env.DB, 'pc', ids, {
        allowPhysicalDelete: Boolean(settings.asset_allow_physical_delete),
        updatedBy: user.username || null,
      });
      if (result.processed) {
        invalidateSystemDictionaryReferenceCache();
        await syncSystemDictionaryUsageCounters(env.DB, ['pc_brand', 'asset_archive_reason', 'department']);
      }
      for (const item of result.successes) {
        if (item.action === 'archive') {
          await logAudit(env.DB, request, user, 'PC_ASSET_ARCHIVE', 'pc_assets', item.id, {
            brand: item.row?.brand,
            serial_no: item.row?.serial_no,
            model: item.row?.model,
            status: item.row?.status,
            archived_reason: item.reason,
          });
          continue;
        }
        if (item.action === 'purge') {
          await logAudit(env.DB, request, user, 'PC_ASSET_PURGE', 'pc_assets', item.id, {
            brand: item.row?.brand,
            serial_no: item.row?.serial_no,
            model: item.row?.model,
            status: item.row?.status,
            archived: true,
            purge_related: item.related_counts || {},
          });
          continue;
        }
        await logAudit(env.DB, request, user, 'PC_ASSET_DELETE', 'pc_assets', item.id, {
          brand: item.row?.brand,
          serial_no: item.row?.serial_no,
          model: item.row?.model,
          status: item.row?.status,
        });
      }
      await logAudit(env.DB, request, user, 'PC_ASSET_DELETE_BATCH', 'pc_assets', String(ids.length), {
        requested_ids: ids,
        processed: result.processed,
        archived: result.archived,
        deleted: result.deleted,
        purged: result.purged,
        failed: result.failed,
        failed_ids: result.failures.map((item) => item.id),
      });
      return Response.json({
        ok: true,
        processed: result.processed,
        archived: result.archived,
        deleted: result.deleted,
        purged: result.purged,
        failed: result.failed,
        failed_records: result.failures.map((item) => ({
          ID: item.id || '-',
          品牌: item.row?.brand || '-',
          型号: item.row?.model || '-',
          序列号: item.row?.serial_no || '-',
          原因: item.message,
        })),
        message: result.failed
          ? `已处理 ${result.processed} 台电脑，失败 ${result.failed} 台`
          : result.archived || result.purged
            ? `已处理 ${result.processed} 台电脑（归档 ${result.archived} 台，彻底删除 ${result.purged} 台，物理删除 ${result.deleted} 台）`
            : `已删除 ${result.deleted} 台电脑`,
      });
    }

    if (action === 'owner') {
      const owner = parseOwnerInput(body);
      await assertDepartmentDictionaryValue(env.DB, owner.department, '领用部门', { allowEmpty: true });
      const result = await bulkUpdatePcOwner(env.DB, ids, owner);
      invalidateSystemDictionaryReferenceCache();
      await syncSystemDictionaryUsageCounters(env.DB, ['asset_archive_reason','department']);
      await logAudit(env.DB, request, user, 'PC_ASSET_OWNER_BATCH', 'pc_assets', String(ids.length), {
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
        message: result.skipped ? `已更新 ${result.changed} 台电脑领用人，跳过 ${result.skipped} 台非已领用电脑` : `已更新 ${result.changed} 台电脑领用人`,
      });
    }

    throw Object.assign(new Error('不支持的批量操作'), { status: 400 });
  } catch (error: any) {
    return errorResponse(error);
  }
};
