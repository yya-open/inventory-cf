import { requireAuth, errorResponse } from '../_auth';
import { ensureMonitorSchemaIfAllowed } from './_monitor';
import { logAudit } from './_audit';
import { applyMonitorMovement, getMonitorAssetByIdOrCode, getRequestMeta, parseMonitorOutFields, parseMonitorTarget } from './services/asset-write';

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, 'operator');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const body = await request.json().catch(() => ({} as any));
    const target = parseMonitorTarget(body);
    const fields = parseMonitorOutFields(body);
    const asset = await getMonitorAssetByIdOrCode(env.DB, target.asset_id, target.asset_code);
    const result = await applyMonitorMovement(env.DB, {
      txType: 'OUT',
      prefix: 'MONOUT',
      asset,
      ...fields,
      createdBy: user.username,
      requestMeta: getRequestMeta(request),
    });

    await logAudit(env.DB, request, user, 'monitor_out', 'monitor_assets', asset.id, {
      tx_no: result.tx_no,
      employee_no: fields.employee_no,
      employee_name: fields.employee_name,
      department: fields.department,
      to_location_id: fields.to_location_id,
      remark: fields.remark,
    });
    return Response.json({ ok: true, message: '出库成功', data: { tx_no: result.tx_no } });
  } catch (e: any) {
    return errorResponse(e);
  }
};
