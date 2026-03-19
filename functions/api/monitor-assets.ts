import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
import { getSystemSettings } from './services/system-settings';
import { ensureMonitorSchemaIfAllowed } from './_monitor';
import {
  assertUnique,
  buildMonitorAssetQuery,
  countByWhere,
  listMonitorAssets,
  monitorAssetInsertSql,
  monitorAssetArchiveSql,
  monitorAssetUpdateSql,
  parseMonitorAssetInput,
} from './services/asset-ledger';

async function getMonitorRelatedRecordCounts(db: D1Database, id: number) {
  const refs = await db
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM monitor_tx WHERE asset_id=?) AS tx_count,
        (SELECT COUNT(*) FROM monitor_inventory_log WHERE asset_id=?) AS inventory_log_count
    `)
    .bind(id, id)
    .first<any>();

  return {
    tx_count: Number(refs?.tx_count || 0),
    inventory_log_count: Number(refs?.inventory_log_count || 0),
  };
}

async function purgeArchivedMonitorAsset(db: D1Database, id: number) {
  const counts = await getMonitorRelatedRecordCounts(db, id);
  await db.batch([
    db.prepare('DELETE FROM monitor_tx WHERE asset_id=?').bind(id),
    db.prepare('DELETE FROM monitor_inventory_log WHERE asset_id=?').bind(id),
    db.prepare('DELETE FROM monitor_assets WHERE id=?').bind(id),
  ]);
  return {
    ...counts,
    related_total: counts.tx_count + counts.inventory_log_count,
  };
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);
    const query = buildMonitorAssetQuery(url);
    const total = query.fast ? null : await countByWhere(env.DB, 'monitor_assets a', query);
    const data = await listMonitorAssets(env.DB, query);
    return Response.json({ ok: true, data, total, page: query.page, pageSize: query.pageSize });
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
    await assertUnique(env.DB, 'SELECT id FROM monitor_assets WHERE asset_code=?', [payload.asset_code], '资产编号已存在');

    const result = await env.DB
      .prepare(monitorAssetInsertSql())
      .bind(payload.asset_code, payload.sn, payload.brand, payload.model, payload.size_inch, payload.remark, payload.location_id)
      .run();

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
    await assertUnique(env.DB, 'SELECT id FROM monitor_assets WHERE asset_code=? AND id<>?', [payload.asset_code, id], '资产编号已存在');

    await env.DB
      .prepare(monitorAssetUpdateSql())
      .bind(payload.asset_code, payload.sn, payload.brand, payload.model, payload.size_inch, payload.remark, payload.location_id, id)
      .run();

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

    const asset = await env.DB.prepare('SELECT * FROM monitor_assets WHERE id=?').bind(id).first<any>();
    if (!asset) throw Object.assign(new Error('显示器台账不存在'), { status: 404 });

    if (Number(asset.archived || 0) === 1) {
      const purgeSummary = await purgeArchivedMonitorAsset(env.DB, id);
      await logAudit(env.DB, request, user, 'MONITOR_ASSET_DELETE', 'monitor_assets', id, {
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
    const refs = await getMonitorRelatedRecordCounts(env.DB, id);
    const hasRefs = refs.tx_count > 0 || refs.inventory_log_count > 0;

    if (hasRefs || !settings.asset_allow_physical_delete) {
      const archiveReason = hasRefs ? '有历史记录，删除改为归档' : '系统策略：优先归档';
      await env.DB.prepare(monitorAssetArchiveSql()).bind(archiveReason, null, user.username, id).run();
      await logAudit(env.DB, request, user, 'MONITOR_ASSET_ARCHIVE', 'monitor_assets', id, { asset_code: asset.asset_code, status: asset.status, archived_reason: archiveReason });
      return Response.json({ ok: true, archived: true, message: hasRefs ? '该资产已有历史记录，已自动归档' : '当前系统已禁用物理删除，已自动归档' });
    }

    await env.DB.prepare('DELETE FROM monitor_assets WHERE id=?').bind(id).run();
    await logAudit(env.DB, request, user, 'MONITOR_ASSET_DELETE', 'monitor_assets', id, { asset_code: asset.asset_code });
    return Response.json({ ok: true, message: '删除成功' });
  } catch (error: any) {
    return errorResponse(error);
  }
};
