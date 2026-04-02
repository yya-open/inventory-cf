import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
import {
  ensurePcSchema,
  must,
  optional,
  pcOutNo,
  getPcAssetByIdOrSerial,
  isInStockStatus,
  toAssetStatusAfterOut,
} from './_pc';
import { applyPcOut } from './services/asset-write';
import { assertDepartmentDictionaryValue } from './services/master-data';
import { buildChildWriteNo, findExistingByNo } from './services/write-idempotency';

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

    const body = await request.json<any>().catch(() => ({} as any));
    const items: Item[] = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return Response.json({ ok: false, message: 'items 不能为空' }, { status: 400 });

    let success = 0;
    let duplicated = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const it: any = items[i] || {};
        const { no } = buildChildWriteNo('PCOUT', pcOutNo, body?.client_request_id, i + 1);
        const existingByNo = await findExistingByNo(env.DB, 'pc_out', 'out_no', no, 'out_no, asset_id');
        if (existingByNo?.out_no) {
          success++;
          duplicated++;
          continue;
        }

        const employee_no = must(it?.employee_no, '员工工号', 60);
        const department = must(it?.department, '部门', 120);
        await assertDepartmentDictionaryValue(env.DB, department, '领用部门');
        const employee_name = must(it?.employee_name, '员工姓名', 120);
        const is_employed = optional(it?.is_employed, 40);
        const config_date = optional(it?.config_date, 40);
        const remark = optional(it?.remark, 2000);

        const asset = await getPcAssetByIdOrSerial(env.DB, it?.asset_id, it?.serial_no);
        if (!asset) throw new Error('未找到该电脑资产（请检查序列号/asset_id）');
        if (!isInStockStatus(asset.status)) throw new Error('该电脑当前不是“在库”，无法出库');

        const afterStatus = toAssetStatusAfterOut();
        await applyPcOut({
          db: env.DB,
          outNo: no,
          asset,
          employeeNo: employee_no,
          department,
          employeeName: employee_name,
          isEmployed: is_employed,
          configDate: config_date,
          remark,
          createdBy: user.username,
          statusAfter: afterStatus,
        });

        waitUntil(logAudit(env.DB, request, user, 'PC_OUT_BATCH', 'pc_out', no, {
          asset_id: asset.id,
          serial_no: asset.serial_no,
          employee_no,
          department,
          employee_name,
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
