import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
import { ensurePcSchema, must, optional, getPcAssetByIdOrSerial, normalizeText, pcRecycleNo } from "./_pc";

function assertAssigned(status: any) {
  return String(status) === "ASSIGNED";
}

function mustAction(v: any) {
  const a = normalizeText(v, 20).toUpperCase();
  if (a != "RETURN" && a != "RECYCLE") {
    const err: any = new Error("动作(action) 必须是 RETURN(归还) 或 RECYCLE(回收)");
    err.status = 400;
    throw err;
  }
  return a as "RETURN" | "RECYCLE";
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({
  env,
  request,
  waitUntil,
}) => {
  try {
    const user = await requireAuth(env, request, "operator");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    await ensurePcSchema(env.DB);

    const body = await request.json<any>();

    const asset = await getPcAssetByIdOrSerial(env.DB, body?.asset_id, body?.serial_no);
    if (!asset) return Response.json({ ok: false, message: "未找到该电脑资产" }, { status: 404 });

    if (!assertAssigned(asset.status)) {
      return Response.json({ ok: false, message: "该电脑当前不是“已领用”，无法回收/归还" }, { status: 400 });
    }

    const action = mustAction(body?.action); // RETURN / RECYCLE
    const recycle_date = must(body?.recycle_date, "回收/归还日期", 40);
    const remark = optional(body?.remark, 2000);

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
        lastOut?.employee_no ?? null,
        lastOut?.department ?? null,
        lastOut?.employee_name ?? null,
        lastOut?.is_employed ?? null,
        asset.brand,
        asset.serial_no,
        asset.model,
        recycle_date,
        remark,
        user.username,
      ),
      env.DB.prepare(
        `UPDATE pc_assets
         SET status=?, updated_at=datetime('now')
         WHERE id=?`
      ).bind(afterStatus, asset.id),
    ]);

    const auditAction = action === "RETURN" ? "PC_RETURN" : "PC_RECYCLE";
    waitUntil(logAudit(env.DB, request, user, auditAction, "pc_recycle", no, {
      asset_id: asset.id,
      action,
      brand: asset.brand,
      serial_no: asset.serial_no,
      model: asset.model,
      recycle_date,
      remark,
      status_after: afterStatus,
      employee_no: lastOut?.employee_no ?? null,
      employee_name: lastOut?.employee_name ?? null,
      department: lastOut?.department ?? null,
    }).catch(() => {}));

    return Response.json({ ok: true, recycle_no: no, asset_id: asset.id, status_after: afterStatus });
  } catch (e: any) {
    return errorResponse(e);
  }
};
