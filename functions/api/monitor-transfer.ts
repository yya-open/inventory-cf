import { requireAuth, errorResponse } from "../_auth";
import { ensureMonitorSchemaIfAllowed, monitorTxNo } from "./_monitor";
import { optional, normalizeText } from "./_pc";
import { logAudit } from "./_audit";
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

    const to_location_id = Number(body?.to_location_id || body?.location_id || 0);
    if (!to_location_id) throw Object.assign(new Error("请选择目标位置"), { status: 400 });
    const remark = optional(body?.remark, 1000);

    const asset = await getMonitorAssetByIdOrCode(env.DB, asset_id, asset_code);
    assertMonitorMovementAllowed(asset, 'TRANSFER');
    const tx_no = monitorTxNo("MONTR");
    await applyMonitorMovement({
      db: env.DB,
      asset,
      txNo: tx_no,
      type: 'TRANSFER',
      userName: user.username,
      clientMeta: getRequestClientMeta(request),
      toLocationId: to_location_id,
      employeeNo: asset.employee_no,
      department: asset.department,
      employeeName: asset.employee_name,
      isEmployed: asset.is_employed,
      remark,
    });

    await logAudit(env.DB, request, user, monitorMovementAuditAction('TRANSFER'), "monitor_assets", asset.id, { tx_no, to_location_id, remark });
    return Response.json({ ok: true, message: "调拨成功", data: { tx_no } });
  } catch (e: any) {
    return errorResponse(e);
  }
};
