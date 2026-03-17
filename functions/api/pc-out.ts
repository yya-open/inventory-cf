import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
import {
  ensurePcSchema,
  must,
  optional,
  pcOutNo,
  getPcAssetByIdOrSerial,
  isInStockStatus,
  toAssetStatusAfterOut,
} from "./_pc";
import { applyPcOut } from "./services/asset-write";

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuth(env, request, "operator");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    await ensurePcSchema(env.DB);

    const body = await request.json<any>();
    const employee_no = must(body?.employee_no, "员工工号", 60);
    const department = must(body?.department, "部门", 120);
    const employee_name = must(body?.employee_name, "员工姓名", 120);
    const is_employed = optional(body?.is_employed, 40);
    const config_date = optional(body?.config_date, 40);
    const remark = optional(body?.remark, 2000);

    if (String(body?.recycle_date || "").trim()) {
      return Response.json({ ok: false, message: "出库不再填写回收日期，请到『电脑回收/归还』页面操作" }, { status: 400 });
    }

    const asset = await getPcAssetByIdOrSerial(env.DB, body?.asset_id, body?.serial_no);
    if (!asset) return Response.json({ ok: false, message: "未找到该电脑资产（请先入库）" }, { status: 404 });
    if (!isInStockStatus(asset.status)) {
      return Response.json({ ok: false, message: "该电脑当前不在库，无法出库" }, { status: 400 });
    }

    const no = pcOutNo();
    const afterStatus = toAssetStatusAfterOut(null);
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

    waitUntil(logAudit(env.DB, request, user, "PC_OUT", "pc_out", no, {
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

    return Response.json({ ok: true, out_no: no, asset_id: asset.id, status_after: afterStatus });
  } catch (e: any) {
    return errorResponse(e);
  }
};
