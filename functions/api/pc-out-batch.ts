import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
import { ensurePcSchema, getPcAssetByIdOrSerial, must, optional } from './_pc';
import { createPcOutRecord } from './services/asset-write';

type Item = {
  employee_no: string;
  department: string;
  employee_name: string;
  is_employed?: string;
  asset_id?: number;
  serial_no?: string;
  config_date?: string;
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
        const employee_no = must(it?.employee_no, '员工工号', 60);
        const department = must(it?.department, '部门', 120);
        const employee_name = must(it?.employee_name, '员工姓名', 120);
        const is_employed = optional(it?.is_employed, 40);
        const config_date = optional(it?.config_date, 40);
        const remark = optional(it?.remark, 2000);

        const asset = await getPcAssetByIdOrSerial(env.DB, it?.asset_id, it?.serial_no);
        const result = await createPcOutRecord(env.DB, asset, {
          employee_no,
          department,
          employee_name,
          is_employed,
          config_date,
          remark,
        }, user.username);

        waitUntil(logAudit(env.DB, request, user, 'pc_out_batch', 'pc_out', result.out_no, { serial_no: asset.serial_no, employee_no }).catch(() => {}));
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
