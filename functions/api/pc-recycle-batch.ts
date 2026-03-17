import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
import { ensurePcSchema, getPcAssetByIdOrSerial, must, optional } from './_pc';
import { createPcRecycleRecord, normalizePcRecycleAction } from './services/asset-write';

type Item = {
  asset_id?: number;
  serial_no?: string;
  action: 'RETURN' | 'RECYCLE' | string;
  recycle_date: string;
  remark?: string;
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuth(env, request, 'operator');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });
    await ensurePcSchema(env.DB);

    const body = await request.json();
    const items: Item[] = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return Response.json({ ok: false, message: 'items 不能为空' }, { status: 400 });

    let success = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const it: any = items[i] || {};
        const asset = await getPcAssetByIdOrSerial(env.DB, it?.asset_id, it?.serial_no);
        const action = normalizePcRecycleAction(it?.action);
        const recycle_date = must(it?.recycle_date, '回收/归还日期', 40);
        const remark = optional(it?.remark, 2000);

        const result = await createPcRecycleRecord(env.DB, asset, action, recycle_date, remark, user.username);
        waitUntil(logAudit(env.DB, request, user, 'pc_recycle_batch', 'pc_recycle', result.recycle_no, { serial_no: asset.serial_no, action }).catch(() => {}));
        success++;
      } catch (e: any) {
        errors.push({ row: i + 2, message: e?.message || '导入失败' });
      }
    }

    return Response.json({ ok: true, success, failed: errors.length, errors });
  } catch (e: any) {
    return errorResponse(e);
  }
};
