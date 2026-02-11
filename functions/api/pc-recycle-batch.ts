import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
import { ensurePcSchema, must, optional, getPcAssetByIdOrSerial, normalizeText, pcRecycleNo } from "./_pc";

function assertAssigned(status: any) {
  return String(status) === "ASSIGNED";
}

function normalizeAction(v: any) {
  const t = normalizeText(v, 20);
  const u = t.toUpperCase();
  if (u === "RETURN" || t === "归还") return "RETURN";
  if (u === "RECYCLE" || t === "回收") return "RECYCLE";
  const err: any = new Error("动作(action) 必须是 RETURN(归还) 或 RECYCLE(回收)");
  err.status = 400;
  throw err;
}

type Item = {
  asset_id?: number;
  serial_no?: string;
  action: "RETURN" | "RECYCLE" | string;
  recycle_date: string;
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
        const asset = await getPcAssetByIdOrSerial(env.DB, it?.asset_id, it?.serial_no);
        if (!asset) throw new Error("未找到该电脑资产（请检查序列号/asset_id）");

        if (!assertAssigned(asset.status)) {
          throw new Error("该电脑当前不是“已领用”，无法回收/归还");
        }

        const action = normalizeAction(it?.action);
        const recycle_date = must(it?.recycle_date, "回收/归还日期", 40);
        const remark = optional(it?.remark, 2000);

        const lastOut = await env.DB.prepare(
          `SELECT employee_no, department, employee_name, is_employed
           FROM pc_out
           WHERE asset_id=?
           ORDER BY id DESC
           LIMIT 1`
        ).bind(asset.id).first<any>();

        const afterStatus = action === "RETURN" ? "IN_STOCK" : "RECYCLED";
        const no = pcRecycleNo();

        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO pc_recycle (
              recycle_no, action, asset_id,
              employee_no, department, employee_name, is_employed,
              brand, serial_no, model,
              recycle_date, remark, created_by
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
          ).bind(
            no,
            action,
            asset.id,
            lastOut?.employee_no || "",
            lastOut?.department || "",
            lastOut?.employee_name || "",
            lastOut?.is_employed || "",
            asset.brand,
            asset.serial_no,
            asset.model,
            recycle_date,
            remark,
            user?.id || ""
          ),

          env.DB.prepare(
            `UPDATE pc_assets
             SET status=?, updated_at=datetime('now')
             WHERE id=?`
          ).bind(afterStatus, asset.id),
        ]);

        waitUntil(logAudit(env.DB, user, "pc_recycle_batch", `电脑批量回收/归还：${asset.serial_no}`, { serial_no: asset.serial_no, action }));
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
