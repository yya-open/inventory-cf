import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
import { ensurePcSchemaIfAllowed } from './_pc';
import {
  assertUnique,
  buildPcAssetQuery,
  countByWhere,
  listPcAssets,
  parsePcAssetInput,
  pcAssetArchiveSql,
  pcAssetUpdateSql,
} from './services/asset-ledger';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    const timing = (env as any).__timing;
    if (timing?.measure) await timing.measure('schema', () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    const query = buildPcAssetQuery(url);
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

    const payload = parsePcAssetInput(body);
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
        id
      )
      .run();

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

    const asset = await env.DB.prepare('SELECT * FROM pc_assets WHERE id=?').bind(id).first<any>();
    if (!asset) throw Object.assign(new Error('电脑台账不存在或已删除'), { status: 404 });
    if (String(asset.status) === 'ASSIGNED') {
      throw Object.assign(new Error('该电脑当前为已领用状态，请先办理回收/归还后再删除'), { status: 400 });
    }

    const refs = await env.DB
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM pc_out WHERE asset_id=?) AS out_count,
          (SELECT COUNT(*) FROM pc_recycle WHERE asset_id=?) AS recycle_count,
          (SELECT COUNT(*) FROM pc_inventory_log WHERE asset_id=?) AS inventory_log_count
      `)
      .bind(id, id, id)
      .first<any>();

    const hasRefs = Number(refs?.out_count || 0) > 0 || Number(refs?.recycle_count || 0) > 0 || Number(refs?.inventory_log_count || 0) > 0;

    if (hasRefs) {
      await env.DB.prepare(pcAssetArchiveSql()).bind(id).run();
      await logAudit(env.DB, request, user, 'PC_ASSET_ARCHIVE', 'pc_assets', id, {
        brand: asset.brand,
        serial_no: asset.serial_no,
        model: asset.model,
        status: asset.status,
      });
      return Response.json({ ok: true, archived: true, message: '该电脑已有历史记录，已自动归档' });
    }

    await env.DB.batch([env.DB.prepare('DELETE FROM pc_in WHERE asset_id=?').bind(id), env.DB.prepare('DELETE FROM pc_assets WHERE id=?').bind(id)]);
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
