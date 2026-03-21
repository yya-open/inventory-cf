import { requireAuth, errorResponse } from "../_auth";
import { ensureMonitorSchemaIfAllowed, monitorTxNo } from "./_monitor";
import { must, optional, normalizeText } from "./_pc";
import { logAudit } from "./_audit";
import { assertDepartmentDictionaryValue } from './services/master-data';
import {
  applyMonitorMovement,
  assertMonitorMovementAllowed,
  getMonitorAssetByIdOrCode,
  getRequestClientMeta,
  monitorMovementAuditAction,
} from "./services/asset-write";

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "operator");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const body = await request.json<any>().catch(() => ({} as any));
    const asset_id = Number(body?.asset_id || 0);
    const asset_code = normalizeText(body?.asset_code, 120);
    if (!asset_id && !asset_code) throw Object.assign(new Error("缺少资产ID/资产编号"), { status: 400 });

    const employee_no = must(body?.employee_no, "工号", 80);
    const employee_name = must(body?.employee_name, "姓名", 120);
    const department = must(body?.department, "部门", 120);
    await assertDepartmentDictionaryValue(env.DB, department, '领用部门');
    const is_employed = optional(body?.is_employed, 20);
    const to_location_id = Number(body?.location_id || body?.to_location_id || 0) || null;
    const remark = optional(body?.remark, 1000);

    const asset = await getMonitorAssetByIdOrCode(env.DB, asset_id, asset_code);
    assertMonitorMovementAllowed(asset, 'OUT');
    const tx_no = monitorTxNo("MONOUT");
    await applyMonitorMovement({
      db: env.DB,
      asset,
      txNo: tx_no,
      type: 'OUT',
      userName: user.username,
      clientMeta: getRequestClientMeta(request),
      toLocationId: to_location_id,
      employeeNo: employee_no,
      department,
      employeeName: employee_name,
      isEmployed: is_employed,
      remark,
    });

    await logAudit(env.DB, request, user, monitorMovementAuditAction('OUT'), "monitor_assets", asset.id, {
      tx_no,
      employee_no,
      employee_name,
      department,
      to_location_id,
      remark,
    });
    return Response.json({ ok: true, message: "出库成功", data: { tx_no } });
  } catch (e: any) {
    return errorResponse(e);
  }
};
