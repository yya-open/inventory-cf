import { requireAuth, errorResponse } from '../_auth';
import { requirePermission } from '../_permissions';
import { logAudit } from './_audit';
import { ensurePcSchemaIfAllowed } from './_pc';
import { getSystemSettings } from './services/system-settings';
import { parseArchiveMeta, parseOwnerInput } from './services/asset-ledger';
import { bulkArchiveAssets, bulkRestoreAssets, bulkUpdatePcOwner, bulkUpdatePcStatus, loadAssetRows } from './services/asset-bulk';
import { bulkDeleteAssets } from './services/asset-bulk-delete';
import { getRelatedRecordCounts, hasRelatedHistory } from './services/asset-archive';
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
      await syncSystemDictionaryUsageCounters(env.DB, ['asset_archive_reason']);
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
        affected_ids: result.ids,
        skipped_ids: result.skippedIds,
        message: result.skipped ? `已归档 ${result.changed} 台电脑，跳过 ${result.skipped} 台` : `已归档 ${result.changed} 台电脑`,
      });
    }

    if (action === 'restore') {
      const result = await bulkRestoreAssets(env.DB, 'pc', ids);
      invalidateSystemDictionaryReferenceCache();
      await syncSystemDictionaryUsageCounters(env.DB, ['asset_archive_reason']);
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
        affected_ids: result.ids,
        skipped_ids: result.skippedIds,
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
        affected_ids: result.ids,
        skipped_ids: result.skippedIds,
        message: result.skipped ? `已更新 ${result.changed} 台电脑状态，跳过 ${result.skipped} 台` : `已更新 ${result.changed} 台电脑状态`,
      });
    }


    if (action === 'delete') {
      const existingRows = await loadAssetRows(env.DB, 'pc', ids);
      const settings = await getSystemSettings(env.DB);
      const previewOnly = body?.preview_only === true || body?.preview_only === 1 || body?.preview_only === '1';
      if (previewOnly) {
        const previewItems = [];
        for (const id of ids) {
          const row = existingRows.find((item) => Number(item.id) === Number(id));
          if (!row) {
            previewItems.push({ id: Number(id), blocked: true, reason: '电脑台账不存在或已删除' });
            continue;
          }
          if (String(row.status || '') === 'ASSIGNED') {
            previewItems.push({
              id: Number(id),
              operation: 'blocked',
              blocked: true,
              archived: Number(row.archived || 0) === 1,
              related_total: 0,
              related_counts: {},
              reason: '该电脑当前为已领用状态，请先办理回收/归还后再删除',
            });
            continue;
          }
          const refs = await getRelatedRecordCounts(env.DB, 'pc', Number(id));
          const hasRefs = hasRelatedHistory('pc', refs);
          const relatedTotal = Object.values(refs || {}).reduce((sum: number, value: any) => sum + Number(value || 0), 0);
          const operation = Number(row.archived || 0) === 1 ? 'purge' : (hasRefs || !settings.asset_allow_physical_delete ? 'archive' : 'delete');
          previewItems.push({
            id: Number(id),
            operation,
            blocked: false,
            archived: Number(row.archived || 0) === 1,
            related_total: relatedTotal,
            related_counts: refs,
            reason: operation === 'purge'
              ? '归档资产将被彻底删除并级联清理历史记录'
              : operation === 'archive'
                ? '存在历史记录或系统策略禁用物理删除，将自动归档'
                : '满足物理删除条件',
          });
        }
        const blocked = previewItems.filter((item: any) => item.blocked).length;
        return Response.json({
          ok: true,
          preview: true,
          data: {
            items: previewItems,
            blocked,
            processed: previewItems.length - blocked,
            archived: previewItems.filter((item: any) => item.operation === 'archive').length,
            deleted: previewItems.filter((item: any) => item.operation === 'delete').length,
            purged: previewItems.filter((item: any) => item.operation === 'purge').length,
          },
        });
      }
      if (existingRows.some((row) => Number(row.archived || 0) === 1)) {
        await requirePermission(env, request, 'asset_purge', 'admin');
      }
      const result = await bulkDeleteAssets(env.DB, 'pc', ids, {
        allowPhysicalDelete: Boolean(settings.asset_allow_physical_delete),
        updatedBy: user.username || null,
      });
      if (result.processed) {
        invalidateSystemDictionaryReferenceCache();
        await syncSystemDictionaryUsageCounters(env.DB, ['pc_brand', 'asset_archive_reason']);
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
        success_items: result.successes.map((item) => ({
          id: Number(item.id || 0),
          action: item.action,
          reason: item.reason || null,
        })),
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
      await syncSystemDictionaryUsageCounters(env.DB, ['asset_archive_reason']);
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
        affected_ids: result.ids,
        skipped_ids: result.skippedIds,
        message: result.skipped ? `已更新 ${result.changed} 台电脑领用人，跳过 ${result.skipped} 台非已领用电脑` : `已更新 ${result.changed} 台电脑领用人`,
      });
    }

    throw Object.assign(new Error('不支持的批量操作'), { status: 400 });
  } catch (error: any) {
    return errorResponse(error);
  }
};
