import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
import { ensurePcSchema, getPcAssetByIdOrSerial, must, optional } from './_pc';
import { createPcOutRecord } from './services/asset-write';

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuth(env, request, 'operator');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    await ensurePcSchema(env.DB);

    const body = await request.json();
    const employee_no = must(body?.employee_no, '员工工号', 60);
    const department = must(body?.department, '部门', 120);
    const employee_name = must(body?.employee_name, '员工姓名', 120);
    const is_employed = optional(body?.is_employed, 40);
    const config_date = optional(body?.config_date, 40);
    const remark = optional(body?.remark, 2000);

    if (String(body?.recycle_date || '').trim()) {
      return Response.json({ ok: false, message: '出库不再填写回收日期，请到『电脑回收/归还』页面操作' }, { status: 400 });
    }

    const asset = await getPcAssetByIdOrSerial(env.DB, body?.asset_id, body?.serial_no);
    const result = await createPcOutRecord(env.DB, asset, {
      employee_no,
      department,
      employee_name,
      is_employed,
      config_date,
      remark,
    }, user.username);

    waitUntil(
      logAudit(env.DB, request, user, 'PC_OUT', 'pc_out', result.out_no, {
        asset_id: result.asset_id,
        employee_no,
        department,
        employee_name,
        is_employed,
        brand: asset.brand,
        serial_no: asset.serial_no,
        model: asset.model,
        config_date,
        remark,
        status_after: result.status_after,
      }).catch(() => {})
    );

    return Response.json({ ok: true, ...result });
  } catch (e: any) {
    return errorResponse(e);
  }
};
