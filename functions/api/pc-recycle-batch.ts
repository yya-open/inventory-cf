import { errorResponse } from '../_auth';
import { logAudit } from './_audit';
import { ensurePcSchema, must, optional, getPcAssetByIdOrSerial, normalizeText, pcRecycleNo } from './_pc';
import { applyPcRecycle, pcRecycleAuditAction } from './services/asset-write';
import { buildChildWriteNo, findExistingByNo } from './services/write-idempotency';
import { assertPcAssetDataScopeAccess, requireAuthWithDataScope } from './services/data-scope';

function assertAssigned(status: any) {
  return String(status) === 'ASSIGNED';
}

function normalizeAction(v: any) {
  const t = normalizeText(v, 20);
  const u = t.toUpperCase();
  if (u === 'RETURN' || t === '归还') return 'RETURN' as const;
  if (u === 'RECYCLE' || t === '回收') return 'RECYCLE' as const;
  const err: any = new Error('动作(action) 必须是 RETURN(归还) 或 RECYCLE(回收)');
  err.status = 400;
  throw err;
}

type Item = {
  asset_id?: number;
  serial_no?: string;
  action: 'RETURN' | 'RECYCLE' | string;
  recycle_date: string;
  remark?: string;
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'operator');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });
    await ensurePcSchema(env.DB);

    const body = await request.json<any>().catch(() => ({} as any));
    const items: Item[] = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return Response.json({ ok: false, message: 'items 不能为空' }, { status: 400 });

    let success = 0;
    let duplicated = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const it: any = items[i] || {};
        const { no } = buildChildWriteNo('PCR', pcRecycleNo, body?.client_request_id, i + 1);
        const existingByNo = await findExistingByNo(env.DB, 'pc_recycle', 'recycle_no', no, 'recycle_no, asset_id');
        if (existingByNo?.recycle_no) {
          success++;
          duplicated++;
          continue;
        }

        const asset = await getPcAssetByIdOrSerial(env.DB, it?.asset_id, it?.serial_no);
        if (!asset) throw new Error('未找到该电脑资产（请检查序列号/asset_id）');
        await assertPcAssetDataScopeAccess(env.DB, user, Number(asset.id || 0), '电脑批量回收/归还');
        if (!assertAssigned(asset.status)) throw new Error('该电脑当前不是“已领用”，无法回收/归还');

        const action = normalizeAction(it?.action);
        const recycle_date = must(it?.recycle_date, '回收/归还日期', 40);
        const remark = optional(it?.remark, 2000);
        const lastOut = await env.DB.prepare(
          `SELECT employee_no, department, employee_name, is_employed
           FROM pc_out WHERE asset_id=? ORDER BY id DESC LIMIT 1`
        ).bind(asset.id).first<any>();

        const afterStatus = await applyPcRecycle({
          db: env.DB,
          recycleNo: no,
          action,
          asset,
          lastOut,
          recycleDate: recycle_date,
          remark,
          createdBy: user.username,
        });

        waitUntil(logAudit(env.DB, request, user, `${pcRecycleAuditAction(action)}_BATCH`, 'pc_recycle', no, {
          asset_id: asset.id,
          serial_no: asset.serial_no,
          action,
          recycle_date,
          status_after: afterStatus,
        }).catch(() => {}));
        success++;
      } catch (e: any) {
        errors.push({ row: i + 2, message: e?.message || '导入失败' });
      }
    }

    return Response.json({ ok: true, success, duplicated, failed: errors.length, errors });
  } catch (e: any) {
    return errorResponse(e);
  }
};
