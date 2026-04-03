import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
import { ensurePcSchemaIfAllowed, must, optional, getPcAssetByIdOrSerial, normalizeText, pcRecycleNo } from './_pc';
import { applyPcRecycle, pcRecycleAuditAction } from './services/asset-write';
import { buildWriteNo, findExistingByNo } from './services/write-idempotency';

function assertAssigned(status: any) {
  return String(status) === 'ASSIGNED';
}

function mustAction(v: any) {
  const a = normalizeText(v, 20).toUpperCase();
  if (a !== 'RETURN' && a !== 'RECYCLE') {
    const err: any = new Error('动作(action) 必须是 RETURN(归还) 或 RECYCLE(回收)');
    err.status = 400;
    throw err;
  }
  return a as 'RETURN' | 'RECYCLE';
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuth(env, request, 'operator');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });
    await ensurePcSchemaIfAllowed(env.DB, env, new URL(request.url));

    const body = await request.json<any>().catch(() => ({} as any));
    const { no } = buildWriteNo('PCR', pcRecycleNo, body?.client_request_id);
    const existing = await findExistingByNo(env.DB, 'pc_recycle', 'recycle_no', no, 'recycle_no, asset_id');
    if (existing?.recycle_no) {
      return Response.json({ ok: true, recycle_no: existing.recycle_no, asset_id: Number(existing.asset_id || 0) || null, duplicate: true, message: '回收/归还成功（幂等命中）' });
    }

    const asset = await getPcAssetByIdOrSerial(env.DB, body?.asset_id, body?.serial_no);
    if (!asset) return Response.json({ ok: false, message: '未找到该电脑资产' }, { status: 404 });
    if (!assertAssigned(asset.status)) {
      return Response.json({ ok: false, message: '该电脑当前不是“已领用”，无法回收/归还' }, { status: 400 });
    }

    const action = mustAction(body?.action);
    const recycle_date = must(body?.recycle_date, '回收/归还日期', 40);
    const remark = optional(body?.remark, 2000);

    const lastOut = await env.DB.prepare(
      `SELECT employee_no, department, employee_name, is_employed
       FROM pc_out
       WHERE asset_id=?
       ORDER BY id DESC
       LIMIT 1`
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

    waitUntil(logAudit(env.DB, request, user, pcRecycleAuditAction(action), 'pc_recycle', no, {
      asset_id: asset.id,
      action,
      brand: asset.brand,
      serial_no: asset.serial_no,
      model: asset.model,
      recycle_date,
      remark,
      status_after: afterStatus,
      employee_no: lastOut?.employee_no ?? null,
      employee_name: lastOut?.employee_name ?? null,
      department: lastOut?.department ?? null,
    }).catch(() => {}));

    return Response.json({ ok: true, recycle_no: no, asset_id: asset.id, status_after: afterStatus, duplicate: false });
  } catch (e: any) {
    return errorResponse(e);
  }
};
