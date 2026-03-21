import { requireAuth, errorResponse } from '../_auth';
import { requirePermission } from '../_permissions';
import { logAudit } from './_audit';
import { getSystemSettings } from './services/system-settings';
import { ensurePcSchemaIfAllowed } from './_pc';
import {
  assertUnique,
  buildPcAssetQuery,
  countByWhere,
  listPcAssets,
  parsePcAssetInput,
  pcAssetUpdateSql,
  buildPcAssetSearchText,
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
import { assertPcBrandDictionaryValue } from './services/master-data';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    const timing = (env as any).__timing;
    if (timing?.measure) await timing.measure('schema', () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    const query = buildPcAssetQuery(url, user);
    const total = query.fast
      ? null
      : timing?.measure
        ? await timing.measure('count', () => countByWhere(env.DB, 'pc_assets a', query))
        : await countByWhere(env.DB, 'pc_assets a', query);

    const data = timing?.measure ? await timing.measure('query', () => listPcAssets(env.DB, query)) : await listPcAssets(env.DB, query);
    return Response.json({ ok: true, data, total, page: query.page, pageSize: query.pageSize });
  } catch (error: any) {
    return errorResponse(error);
  }
};

export const onRequestPut: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, 'operator');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    const timing = (env as any).__timing;
    if (timing?.measure) await timing.measure('schema', () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    const body = await request.json<any>().catch(() => ({} as any));
    const id = Number(body?.id || 0);
    if (!id) throw Object.assign(new Error('缺少资产ID'), { status: 400 });

    const old = await env.DB.prepare('SELECT * FROM pc_assets WHERE id=?').bind(id).first<any>();
    if (!old) throw Object.assign(new Error('电脑台账不存在或已删除'), { status: 404 });
    if (Number(old.archived || 0) === 1) throw Object.assign(new Error('该电脑已归档，请先恢复归档后再编辑'), { status: 400 });

    const payload = parsePcAssetInput(body);
    await assertPcBrandDictionaryValue(env.DB, payload.brand, '电脑品牌');
    await assertUnique(env.DB, 'SELECT id FROM pc_assets WHERE serial_no=? AND id<>?', [payload.serial_no, id], '序列号已存在');

    await env.DB
      .prepare(pcAssetUpdateSql())
      .bind(
        payload.brand,
        payload.serial_no,
        payload.model,
        payload.manufacture_date,
        payload.warranty_end,
        payload.disk_capacity,
        payload.memory_size,
        payload.remark,
        buildPcAssetSearchText(payload),
        id
      )
      .run();

    invalidateSystemDictionaryReferenceCache();
    await syncSystemDictionaryUsageCounters(env.DB, ['pc_brand']);
    await logAudit(env.DB, request, user, 'PC_ASSET_UPDATE', 'pc_assets', id, {
      before: {
        brand: old.brand,
        serial_no: old.serial_no,
        model: old.model,
        manufacture_date: old.manufacture_date,
        warranty_end: old.warranty_end,
        disk_capacity: old.disk_capacity,
        memory_size: old.memory_size,
        remark: old.remark,
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
    const timing = (env as any).__timing;
    if (timing?.measure) await timing.measure('schema', () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    const body = await request.json<any>().catch(() => ({} as any));
    const id = Number(body?.id || url.searchParams.get('id') || 0);
    if (!id) throw Object.assign(new Error('缺少资产ID'), { status: 400 });


    const previewOnly = body?.preview_only === true || body?.preview_only === 1 || body?.preview_only === '1';
    const asset = await getAssetById(env.DB, 'pc', id);
    if (!asset) throw Object.assign(new Error('电脑台账不存在或已删除'), { status: 404 });


    if (previewOnly) {
      const refs = await getRelatedRecordCounts(env.DB, 'pc', id);
      const hasRefs = hasRelatedHistory('pc', refs);
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
      const purgeSummary = await purgeArchivedAsset(env.DB, 'pc', id);
      invalidateSystemDictionaryReferenceCache();
      await syncSystemDictionaryUsageCounters(env.DB, ['pc_brand', 'asset_archive_reason', 'department']);
      await logAudit(env.DB, request, user, 'PC_ASSET_PURGE', 'pc_assets', id, {
        brand: asset.brand,
        serial_no: asset.serial_no,
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
          ? `已彻底删除归档电脑，并清理 ${purgeSummary.related_total} 条关联记录`
          : '已彻底删除归档电脑',
      });
    }

    if (String(asset.status) === 'ASSIGNED') {
      throw Object.assign(new Error('该电脑当前为已领用状态，请先办理回收/归还后再删除'), { status: 400 });
    }

    const settings = await getSystemSettings(env.DB);
    const refs = await getRelatedRecordCounts(env.DB, 'pc', id);
    const hasRefs = hasRelatedHistory('pc', refs);

    if (hasRefs || !settings.asset_allow_physical_delete) {
      const archiveReason = hasRefs ? '有历史记录，删除改为归档' : '系统策略：优先归档';
      await archiveAsset(env.DB, 'pc', id, user.username || null, archiveReason, null);
      invalidateSystemDictionaryReferenceCache();
      await syncSystemDictionaryUsageCounters(env.DB, ['asset_archive_reason']);
      await logAudit(env.DB, request, user, 'PC_ASSET_ARCHIVE', 'pc_assets', id, {
        brand: asset.brand,
        serial_no: asset.serial_no,
        model: asset.model,
        status: asset.status,
        archived_reason: archiveReason,
      });
      return Response.json({ ok: true, archived: true, message: hasRefs ? '该电脑已有历史记录，已自动归档' : '当前系统已禁用物理删除，已自动归档' });
    }

    await deleteAssetRow(env.DB, 'pc', id);
    invalidateSystemDictionaryReferenceCache();
    await syncSystemDictionaryUsageCounters(env.DB, ['pc_brand', 'asset_archive_reason', 'department']);
    await logAudit(env.DB, request, user, 'PC_ASSET_DELETE', 'pc_assets', id, {
      brand: asset.brand,
      serial_no: asset.serial_no,
      model: asset.model,
      status: asset.status,
    });

    return Response.json({ ok: true, message: '删除成功' });
  } catch (error: any) {
    return errorResponse(error);
  }
};
