import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
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
    const id = Number(body?.id || 0);
    if (!id) throw Object.assign(new Error('缺少资产ID'), { status: 400 });

    const asset = await env.DB.prepare('SELECT * FROM monitor_assets WHERE id=?').bind(id).first<any>();
    if (!asset) throw Object.assign(new Error('显示器台账不存在'), { status: 404 });

    const refs = await env.DB
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM monitor_tx WHERE asset_id=?) AS tx_count,
          (SELECT COUNT(*) FROM monitor_inventory_log WHERE asset_id=?) AS inventory_log_count
      `)
      .bind(id, id)
      .first<any>();
    const hasRefs = Number(refs?.tx_count || 0) > 0 || Number(refs?.inventory_log_count || 0) > 0;

    if (hasRefs) {
      await env.DB.prepare(monitorAssetArchiveSql()).bind(id).run();
      await logAudit(env.DB, request, user, 'MONITOR_ASSET_ARCHIVE', 'monitor_assets', id, { asset_code: asset.asset_code, status: asset.status });
      return Response.json({ ok: true, archived: true, message: '该资产已有历史记录，已自动归档' });
    }

    await env.DB.prepare('DELETE FROM monitor_assets WHERE id=?').bind(id).run();
    await logAudit(env.DB, request, user, 'MONITOR_ASSET_DELETE', 'monitor_assets', id, { asset_code: asset.asset_code });
    return Response.json({ ok: true, message: '删除成功' });
  } catch (error: any) {
    return errorResponse(error);
  }
};
