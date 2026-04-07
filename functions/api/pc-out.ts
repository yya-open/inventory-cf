import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
import {
  ensurePcSchemaIfAllowed,
  must,
  optional,
  pcOutNo,
  getPcAssetByIdOrSerial,
  isInStockStatus,
  toAssetStatusAfterOut,
} from './_pc';
import { applyPcOut } from './services/asset-write';
import { createTiming } from './_timing';
import { assertDateText, assertEmployeeNo, getDataQualitySettings, trimRemarkByRule } from './services/data-quality';
import { assertDepartmentDictionaryValue } from './services/master-data';
import { buildWriteNo, findExistingByNo } from './services/write-idempotency';

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string; __timing?: any }> = async ({ env, request, waitUntil }) => {
  const t = env.__timing || createTiming();
  const url = new URL(request.url);
  try {
    const user = await t.measure('auth', () => requireAuth(env, request, 'operator'));
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });
    await t.measure('schema', () => ensurePcSchemaIfAllowed(env.DB, env, url));

    const body = await t.measure('parse', () => request.json<any>().catch(() => ({} as any)));
    const quality = await t.measure('settings', () => getDataQualitySettings(env.DB));
    const { no } = buildWriteNo('PCOUT', pcOutNo, body?.client_request_id);
    const existing = await findExistingByNo(env.DB, 'pc_out', 'out_no', no, 'out_no, asset_id');
    if (existing?.out_no) {
      return Response.json({ ok: true, out_no: existing.out_no, asset_id: Number(existing.asset_id || 0) || null, duplicate: true, message: '出库成功（幂等命中）' });
    }

    const employee_no = assertEmployeeNo(must(body?.employee_no, '员工工号', 60), quality.employeeNoPattern);
    const department = must(body?.department, '部门', 120);
    await assertDepartmentDictionaryValue(env.DB, department, '领用部门');
    const employee_name = must(body?.employee_name, '员工姓名', 120);
    const is_employed = optional(body?.is_employed, 40);
    const config_date = assertDateText(optional(body?.config_date, 40), '配置日期');
    const remark = trimRemarkByRule(optional(body?.remark, 2000), quality.remarkMaxLength);

    if (String(body?.recycle_date || '').trim()) {
      return Response.json({ ok: false, message: '出库不再填写回收日期，请到『电脑回收/归还』页面操作' }, { status: 400 });
    }

    const asset = await t.measure('lookup_asset', () => getPcAssetByIdOrSerial(env.DB, body?.asset_id, body?.serial_no));
    if (!asset) return Response.json({ ok: false, message: '未找到该电脑资产（请先入库）' }, { status: 404 });
    if (!isInStockStatus(asset.status)) {
      return Response.json({ ok: false, message: '该电脑当前不在库，无法出库' }, { status: 400 });
    }

    const afterStatus = toAssetStatusAfterOut(null);
    await t.measure('write', () => applyPcOut({
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
    }));

    waitUntil(logAudit(env.DB, request, user, 'PC_OUT', 'pc_out', no, {
      asset_id: asset.id,
      employee_no,
      department,
      employee_name,
      is_employed,
      brand: asset.brand,
      serial_no: asset.serial_no,
      model: asset.model,
      config_date,
      remark,
      status_after: afterStatus,
    }).catch(() => {}));

    return Response.json({ ok: true, out_no: no, asset_id: asset.id, status_after: afterStatus, duplicate: false });
  } catch (e: any) {
    return errorResponse(e);
  }
};
