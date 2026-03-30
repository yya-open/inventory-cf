import { requireAuth, errorResponse } from '../_auth';
import { requirePermission } from '../_permissions';
import { logAudit } from './_audit';
import { getSystemSettings } from './services/system-settings';
import { ensureMonitorSchemaIfAllowed } from './_monitor';
import {
  assertUnique,
  buildMonitorAssetQuery,
  listMonitorAssets,
  monitorAssetInsertSql,
  monitorAssetUpdateSql,
  parseMonitorAssetInput,
  buildMonitorAssetSearchText,
} from './services/asset-ledger';
import {
  archiveAsset,
  deleteAssetRow,
  getAssetById,
  getRelatedRecordCounts,
  hasRelatedHistory,
  purgeArchivedAsset,
} from './services/asset-archive';
import { invalidateSystemDictionaryReferenceCache, syncSystemDictionaryUsageCounters } from './services/system-dictionaries';
import { requireAuthWithDataScope } from './services/data-scope';
import { assertMonitorBrandDictionaryValue } from './services/master-data';
import { ensureSchemaTimed, listAssetPage } from './services/asset-http';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    await ensureSchemaTimed(env as any, 'schema', () => ensureMonitorSchemaIfAllowed(env.DB, env, url));
    const query = buildMonitorAssetQuery(url, user);
    return Response.json({ ok: true, ...(await listAssetPage(env.DB, env as any, 'monitor_assets a', query, listMonitorAssets)) });
  } catch (error: any) {
    return errorResponse(error);
  }
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, 'operator');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const body = await request.json<any>().catch(() => ({} as any));
    const payload = parseMonitorAssetInput(body);
    await assertMonitorBrandDictionaryValue(env.DB, payload.brand, '显示器品牌', { allowEmpty: true });
    await assertUnique(env.DB, 'SELECT id FROM monitor_assets WHERE asset_code=?', [payload.asset_code], '资产编号已存在');

    const result = await env.DB
      .prepare(monitorAssetInsertSql())
.bind(payload.asset_code, payload.sn, payload.brand, payload.model, payload.size_inch, payload.remark, buildMonitorAssetSearchText(payload), payload.location_id)
      .run();

    invalidateSystemDictionaryReferenceCache();
    await syncSystemDictionaryUsageCounters(env.DB, ['monitor_brand']);
    const id = Number(result.meta.last_row_id || 0);
    await logAudit(env.DB, request, user, 'MONITOR_ASSET_CREATE', 'monitor_assets', id, payload);
    return Response.json({ ok: true, message: '新增成功' });
  } catch (error: any) {
    return errorResponse(error);
  }
};

export const onRequestPut: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, 'admin');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const body = await request.json<any>().catch(() => ({} as any));
    const id = Number(body?.id || 0);
    if (!id) throw Object.assign(new Error('缺少资产ID'), { status: 400 });

    const old = await env.DB.prepare('SELECT * FROM monitor_assets WHERE id=?').bind(id).first<any>();
    if (!old) throw Object.assign(new Error('显示器台账不存在'), { status: 404 });
    if (Number(old.archived || 0) === 1) throw Object.assign(new Error('该显示器已归档，请先恢复归档后再编辑'), { status: 400 });

    const payload = parseMonitorAssetInput(body);
    await assertMonitorBrandDictionaryValue(env.DB, payload.brand, '显示器品牌', { allowEmpty: true });
    await assertUnique(env.DB, 'SELECT id FROM monitor_assets WHERE asset_code=? AND id<>?', [payload.asset_code, id], '资产编号已存在');

    await env.DB
      .prepare(monitorAssetUpdateSql())
.bind(payload.asset_code, payload.sn, payload.brand, payload.model, payload.size_inch, payload.remark, buildMonitorAssetSearchText(payload, { employee_no: old.employee_no, employee_name: old.employee_name, department: old.department }), payload.location_id, id)
      .run();

    invalidateSystemDictionaryReferenceCache();
    await syncSystemDictionaryUsageCounters(env.DB, ['monitor_brand']);
    await logAudit(env.DB, request, user, 'MONITOR_ASSET_UPDATE', 'monitor_assets', id, {
      before: {
        asset_code: old.asset_code,
        sn: old.sn,
        brand: old.brand,
        model: old.model,
        size_inch: old.size_inch,
        remark: old.remark,
        location_id: old.location_id,
      },
      after: payload,
    });
    return Response.json({ ok: true, message: '修改成功' });
  } catch (error: any) {
    return errorResponse(error);
  }
};

export const onRequestDelete: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, 'admin');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const body = await request.json<any>().catch(() => ({} as any));
    const id = Number(body?.id || url.searchParams.get('id') || 0);
    if (!id) throw Object.assign(new Error('缺少资产ID'), { status: 400 });


    const previewOnly = body?.preview_only === true || body?.preview_only === 1 || body?.preview_only === '1';
    const asset = await getAssetById(env.DB, 'monitor', id);
    if (!asset) throw Object.assign(new Error('显示器台账不存在'), { status: 404 });

    if (previewOnly) {
      const refs = await getRelatedRecordCounts(env.DB, 'monitor', id);
      const hasRefs = hasRelatedHistory('monitor', refs);
      const settings = await getSystemSettings(env.DB);
      const relatedTotal = Object.values(refs || {}).reduce((sum: number, value: any) => sum + Number(value || 0), 0);
      const operation = Number(asset.archived || 0) === 1 ? 'purge' : (hasRefs || !settings.asset_allow_physical_delete ? 'archive' : 'delete');
      return Response.json({ ok: true, preview: true, data: {
        operation,
        archived: Number(asset.archived || 0) === 1,
        related_total: relatedTotal,
        related_counts: refs,
        reason: operation === 'purge' ? '归档资产将被彻底删除并级联清理历史记录' : operation === 'archive' ? '存在历史记录或系统策略禁用物理删除，将自动归档' : '满足物理删除条件',
      } });
    }

    if (Number(asset.archived || 0) === 1) {
      await requirePermission(env, request, 'asset_purge', 'admin');
      const purgeSummary = await purgeArchivedAsset(env.DB, 'monitor', id);
      invalidateSystemDictionaryReferenceCache();
      await syncSystemDictionaryUsageCounters(env.DB, ['monitor_brand', 'asset_archive_reason', 'department']);
      await logAudit(env.DB, request, user, 'MONITOR_ASSET_PURGE', 'monitor_assets', id, {
        asset_code: asset.asset_code,
        brand: asset.brand,
        model: asset.model,
        status: asset.status,
        archived: true,
        purge_related: purgeSummary,
      });
      return Response.json({
        ok: true,
        purged: true,
        related_deleted: purgeSummary.related_total,
        message: purgeSummary.related_total
          ? `已彻底删除归档显示器，并清理 ${purgeSummary.related_total} 条关联记录`
          : '已彻底删除归档显示器',
      });
    }

    const settings = await getSystemSettings(env.DB);
    const refs = await getRelatedRecordCounts(env.DB, 'monitor', id);
    const hasRefs = hasRelatedHistory('monitor', refs);

    if (hasRefs || !settings.asset_allow_physical_delete) {
      const archiveReason = hasRefs ? '有历史记录，删除改为归档' : '系统策略：优先归档';
      await archiveAsset(env.DB, 'monitor', id, user.username || null, archiveReason, null);
      invalidateSystemDictionaryReferenceCache();
      await syncSystemDictionaryUsageCounters(env.DB, ['asset_archive_reason']);
      await logAudit(env.DB, request, user, 'MONITOR_ASSET_ARCHIVE', 'monitor_assets', id, { asset_code: asset.asset_code, status: asset.status, archived_reason: archiveReason });
      return Response.json({ ok: true, archived: true, message: hasRefs ? '该资产已有历史记录，已自动归档' : '当前系统已禁用物理删除，已自动归档' });
    }

    await deleteAssetRow(env.DB, 'monitor', id);
    invalidateSystemDictionaryReferenceCache();
    await syncSystemDictionaryUsageCounters(env.DB, ['monitor_brand', 'asset_archive_reason', 'department']);
    await logAudit(env.DB, request, user, 'MONITOR_ASSET_DELETE', 'monitor_assets', id, { asset_code: asset.asset_code });
    return Response.json({ ok: true, message: '删除成功' });
  } catch (error: any) {
    return errorResponse(error);
  }
};
