import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
import { ensurePcSchema, getPcAssetByIdOrSerial, must, optional } from './_pc';
import { createPcRecycleRecord, normalizePcRecycleAction } from './services/asset-write';

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({
  env,
  request,
  waitUntil,
}) => {
  try {
    const user = await requireAuth(env, request, 'operator');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    await ensurePcSchema(env.DB);

    const body = await request.json();
    const asset = await getPcAssetByIdOrSerial(env.DB, body?.asset_id, body?.serial_no);
    const action = normalizePcRecycleAction(body?.action);
    const recycle_date = must(body?.recycle_date, '回收/归还日期', 40);
    const remark = optional(body?.remark, 2000);

    const result = await createPcRecycleRecord(env.DB, asset, action, recycle_date, remark, user.username);

    const auditAction = action === 'RETURN' ? 'PC_RETURN' : 'PC_RECYCLE';
    waitUntil(
      logAudit(env.DB, request, user, auditAction, 'pc_recycle', result.recycle_no, {
        asset_id: result.asset_id,
        action,
        brand: asset.brand,
        serial_no: asset.serial_no,
        model: asset.model,
        recycle_date,
        remark,
        status_after: result.status_after,
        employee_no: result.employee_no,
        employee_name: result.employee_name,
        department: result.department,
      }).catch(() => {})
    );

    return Response.json({ ok: true, recycle_no: result.recycle_no, asset_id: result.asset_id, status_after: result.status_after });
  } catch (e: any) {
    return errorResponse(e);
  }
};
