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
    const user = await requireAuth(env, request, "operator");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    await ensurePcSchema(env.DB);

    const body = await request.json<any>();
    const items: Item[] = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return Response.json({ ok: false, message: "items 不能为空" }, { status: 400 });

    let success = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const it: any = items[i] || {};
        const employee_no = must(it?.employee_no, "员工工号", 60);
        const department = must(it?.department, "部门", 120);
        const employee_name = must(it?.employee_name, "员工姓名", 120);
        const is_employed = optional(it?.is_employed, 40);

        const config_date = optional(it?.config_date, 40);
        const remark = optional(it?.remark, 2000);

        const asset = await getPcAssetByIdOrSerial(env.DB, it?.asset_id, it?.serial_no);
        if (!asset) throw new Error("未找到该电脑资产（请检查序列号/asset_id）");
        if (!isInStockStatus(asset.status)) throw new Error("该电脑当前不是“在库”，无法出库");

        const afterStatus = toAssetStatusAfterOut();
        const no = pcOutNo();

        await env.DB.batch([
          env.DB.prepare(
            `UPDATE pc_assets
             SET status=?, updated_at=datetime('now')
             WHERE id=?`
          ).bind(afterStatus, asset.id),

          env.DB.prepare(
            `INSERT INTO pc_out (
              out_no, asset_id,
              employee_no, department, employee_name, is_employed,
              brand, serial_no, model,
              config_date,
              manufacture_date, warranty_end, disk_capacity, memory_size,
              remark, created_by
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
          ).bind(
            no,
            asset.id,
            employee_no,
            department,
            employee_name,
            is_employed,
            asset.brand,
            asset.serial_no,
            asset.model,
            config_date,
            asset.manufacture_date || "",
            asset.warranty_end || "",
            asset.disk_capacity || "",
            asset.memory_size || "",
            remark,
            user?.id || ""
          ),
        ]);

        waitUntil(logAudit(env.DB, user, "pc_out_batch", `电脑批量出库：${asset.serial_no}`, { serial_no: asset.serial_no, employee_no }));
        success++;
      } catch (e: any) {
        errors.push({ row: i + 2, message: e?.message || "导入失败" });
      }
    }

    return Response.json({ ok: true, success, failed: errors.length, errors });
  } catch (e: any) {
    return errorResponse(e);
  }
};
