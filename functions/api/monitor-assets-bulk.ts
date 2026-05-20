import { withErrorHandling } from './_error';
import { requirePermission } from '../_permissions';
import { logAudit, logAuditBatch } from './_audit';
import { ensureMonitorReadFastGuards, ensureMonitorSchemaIfAllowed } from './_monitor';
import { getSystemSettings } from './services/system-settings';
import { parseArchiveMeta, parseOwnerInput } from './services/asset-ledger';
import {
  bulkArchiveAssets,
  bulkRestoreAssets,
  bulkUpdateMonitorLocation,
  bulkUpdateMonitorOwner,
  bulkUpdateMonitorStatus,
  loadAssetRows,
} from './services/asset-bulk';
import { bulkDeleteAssets } from './services/asset-bulk-delete';
import { batchGetRelatedRecordCounts, hasRelatedHistory } from './services/asset-archive';
import { invalidateSystemDictionaryReferenceCache, syncSystemDictionaryUsageCounters } from './services/system-dictionaries';
import { assertArchiveReasonDictionaryValue, assertDepartmentDictionaryValue } from './services/master-data';
import { invalidateAssetListCache } from './services/asset-list-cache';

const ALLOWED_STATUS = new Set(['IN_STOCK', 'RECYCLED', 'SCRAPPED']);

export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string; __timing?: any }>(async ({ env, request, waitUntil }) => {
    const timing = (env as any).__timing;
    const user = timing?.measure
      ? await timing.measure('permission', () => requirePermission(env, request, 'bulk_operation', 'viewer'))
      : await requirePermission(env, request, 'bulk_operation', 'viewer');
    const body = timing?.measure
      ? await timing.measure('parse', () => request.json().catch(() => ({} as any)))
      : await request.json().catch(() => ({} as any));
    const action = String(body?.action || '').trim();
    const ids: number[] = Array.isArray(body?.ids) ? body.ids.map((v: any) => Number(v)).filter((v: number) => v > 0) : [];
    if (!ids.length) throw Object.assign(new Error('请选择至少一条显示器台账'), { status: 400 });

    if (action === 'restore') {
      if (timing?.measure) await timing.measure('schema_fast', () => ensureMonitorReadFastGuards(env.DB));
      else await ensureMonitorReadFastGuards(env.DB);
    } else {
      const url = new URL(request.url);
      if (timing?.measure) await timing.measure('schema', () => ensureMonitorSchemaIfAllowed(env.DB, env, url));
      else await ensureMonitorSchemaIfAllowed(env.DB, env, url);
    }

    if (action === 'archive') {
      const meta = parseArchiveMeta(body);
      await assertArchiveReasonDictionaryValue(env.DB, meta.reason, '归档原因');
      const result = await bulkArchiveAssets(env.DB, 'monitor', ids, meta.reason, meta.note || null, user.username || null);
      invalidateSystemDictionaryReferenceCache();
      if (result.changed) invalidateAssetListCache('monitor-assets');
      await syncSystemDictionaryUsageCounters(env.DB, ['asset_archive_reason']);
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
        affected_ids: result.ids,
        skipped_ids: result.skippedIds,
        message: result.skipped ? `已归档 ${result.changed} 台显示器，跳过 ${result.skipped} 台` : `已归档 ${result.changed} 台显示器`,
      });
    }

    if (action === 'restore') {
      const result = timing?.measure
        ? await timing.measure('monitor_assets_restore', () => bulkRestoreAssets(env.DB, 'monitor', ids))
        : await bulkRestoreAssets(env.DB, 'monitor', ids);
      if (result.changed) invalidateAssetListCache('monitor-assets');
      waitUntil((async () => {
        invalidateSystemDictionaryReferenceCache();
        await syncSystemDictionaryUsageCounters(env.DB, ['asset_archive_reason']);
        await logAudit(env.DB, request, user, 'MONITOR_ASSET_RESTORE_BATCH', 'monitor_assets', String(ids.length), {
          ids: result.ids,
          requested_ids: ids,
          count: result.changed,
          skipped: result.skipped,
          skipped_ids: result.skippedIds,
        });
      })().catch(() => {}));
      return Response.json({
        ok: true,
        restored: result.changed,
        skipped: result.skipped,
        affected_ids: result.ids,
        skipped_ids: result.skippedIds,
        message: result.skipped ? `已恢复 ${result.changed} 台显示器，跳过 ${result.skipped} 台` : `已恢复 ${result.changed} 台显示器`,
      });
    }

    if (action === 'status') {
      const status = String(body?.status || '').trim();
      if (!ALLOWED_STATUS.has(status)) throw Object.assign(new Error('不支持的目标状态'), { status: 400 });
      const result = await bulkUpdateMonitorStatus(env.DB, ids, status);
      if (result.changed) invalidateAssetListCache('monitor-assets');
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
        affected_ids: result.ids,
        skipped_ids: result.skippedIds,
        message: result.skipped ? `已更新 ${result.changed} 台显示器状态，跳过 ${result.skipped} 台` : `已更新 ${result.changed} 台显示器状态`,
      });
    }

    if (action === 'location') {
      const locationId = Number(body?.location_id || 0) || null;
      const result = await bulkUpdateMonitorLocation(env.DB, ids, locationId);
      if (result.changed) invalidateAssetListCache('monitor-assets');
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
        affected_ids: result.ids,
        skipped_ids: result.skippedIds,
        message: result.skipped ? `已更新 ${result.changed} 台显示器位置，跳过 ${result.skipped} 台` : `已更新 ${result.changed} 台显示器位置`,
      });
    }


    if (action === 'delete') {
      const existingRows = await loadAssetRows(env.DB, 'monitor', ids);
      const settings = await getSystemSettings(env.DB);
      const previewOnly = body?.preview_only === true || body?.preview_only === 1 || body?.preview_only === '1';
      if (previewOnly) {
        const needCountIds = ids.filter(id => {
          const row = existingRows.find((item) => Number(item.id) === Number(id));
          return !!row;
        });
        const refsMap = await batchGetRelatedRecordCounts(env.DB, 'monitor', needCountIds);
        const previewItems = [];
        for (const id of ids) {
          const row = existingRows.find((item) => Number(item.id) === Number(id));
          if (!row) {
            previewItems.push({ id: Number(id), blocked: true, reason: '显示器台账不存在或已删除' });
            continue;
          }
          const refs = refsMap.get(Number(id)) || {};
          const hasRefs = hasRelatedHistory('monitor', refs);
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
        await requirePermission(env, request, 'asset_purge', 'viewer');
      }
      const result = await bulkDeleteAssets(env.DB, 'monitor', ids, {
        allowPhysicalDelete: Boolean(settings.asset_allow_physical_delete),
        updatedBy: user.username || null,
      });
      if (result.processed) {
        invalidateSystemDictionaryReferenceCache();
        invalidateAssetListCache('monitor-assets');
        await syncSystemDictionaryUsageCounters(env.DB, ['monitor_brand', 'asset_archive_reason']);
      }
      await logAuditBatch(env.DB, request, user, result.successes.map((item) => {
        if (item.action === 'archive') {
          return { action: 'MONITOR_ASSET_ARCHIVE', entity: 'monitor_assets', entity_id: item.id, payload: {
            asset_code: item.row?.asset_code,
            brand: item.row?.brand,
            model: item.row?.model,
            status: item.row?.status,
            archived_reason: item.reason,
          } };
        }
        if (item.action === 'purge') {
          return { action: 'MONITOR_ASSET_PURGE', entity: 'monitor_assets', entity_id: item.id, payload: {
            asset_code: item.row?.asset_code,
            brand: item.row?.brand,
            model: item.row?.model,
            status: item.row?.status,
            archived: true,
            purge_related: item.related_counts || {},
          } };
        }
        return { action: 'MONITOR_ASSET_DELETE', entity: 'monitor_assets', entity_id: item.id, payload: {
          asset_code: item.row?.asset_code,
          brand: item.row?.brand,
          model: item.row?.model,
          status: item.row?.status,
        } };
      }));
      await logAudit(env.DB, request, user, 'MONITOR_ASSET_DELETE_BATCH', 'monitor_assets', String(ids.length), {
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
          资产编号: item.row?.asset_code || '-',
          SN: item.row?.sn || '-',
          型号: item.row?.model || '-',
          原因: item.message,
        })),
        message: result.failed
          ? `已处理 ${result.processed} 台显示器，失败 ${result.failed} 台`
          : result.archived || result.purged
            ? `已处理 ${result.processed} 台显示器（归档 ${result.archived} 台，彻底删除 ${result.purged} 台，物理删除 ${result.deleted} 台）`
            : `已删除 ${result.deleted} 台显示器`,
      });
    }

    if (action === 'owner') {
      const owner = parseOwnerInput(body);
      await assertDepartmentDictionaryValue(env.DB, owner.department, '领用部门', { allowEmpty: true });
      const result = await bulkUpdateMonitorOwner(env.DB, ids, owner, {
        createdBy: user.username || null,
        ip: request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '',
        ua: request.headers.get('user-agent') || '',
      });
      invalidateSystemDictionaryReferenceCache();
      if (result.changed) invalidateAssetListCache('monitor-assets');
      await syncSystemDictionaryUsageCounters(env.DB, ['asset_archive_reason']);
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
        affected_ids: result.ids,
        skipped_ids: result.skippedIds,
        message: result.skipped ? `已更新 ${result.changed} 台显示器领用人，跳过 ${result.skipped} 台` : `已更新 ${result.changed} 台显示器领用人`,
      });
    }

    throw Object.assign(new Error('不支持的批量操作'), { status: 400 });
});
