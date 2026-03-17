import { requireAuth, errorResponse } from "../_auth";
import { ensureMonitorSchemaIfAllowed, monitorTxNo } from "./_monitor";
import { must, optional, normalizeText } from "./_pc";
import { logAudit } from "./_audit";

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
    const is_employed = optional(body?.is_employed, 20);

    const to_location_id = Number(body?.location_id || body?.to_location_id || 0) || null;
    const remark = optional(body?.remark, 1000);

    const asset = asset_id
      ? await env.DB.prepare("SELECT * FROM monitor_assets WHERE id=?").bind(asset_id).first<any>()
      : await env.DB.prepare("SELECT * FROM monitor_assets WHERE asset_code=?").bind(asset_code).first<any>();
    if (!asset) throw Object.assign(new Error("显示器台账不存在"), { status: 404 });
    if (String(asset.status) === "SCRAPPED") throw Object.assign(new Error("该资产已报废，无法出库"), { status: 400 });
    if (String(asset.status) === "ASSIGNED") throw Object.assign(new Error("该显示器当前为已领用状态，请先办理归还/回收"), { status: 400 });

    const tx_no = monitorTxNo("MONOUT");
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
    const ua = request.headers.get("user-agent") || "";

    await env.DB.batch([
      env.DB
        .prepare(
          `INSERT INTO monitor_tx
            (tx_no, tx_type, asset_id, asset_code, sn, brand, model, size_inch, from_location_id, to_location_id,
             employee_no, department, employee_name, is_employed, remark, created_by, ip, ua)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .bind(
          tx_no,
          "OUT",
          asset.id,
          asset.asset_code,
          asset.sn,
          asset.brand,
          asset.model,
          asset.size_inch,
          asset.location_id,
          to_location_id,
          employee_no,
          department,
          employee_name,
          is_employed,
          remark,
          user.username,
          ip,
          ua
        ),
      env.DB
        .prepare(
          `UPDATE monitor_assets
           SET status='ASSIGNED', location_id=?, employee_no=?, department=?, employee_name=?, is_employed=?, updated_at=datetime('now','+8 hours')
           WHERE id=?`
        )
        .bind(to_location_id, employee_no, department, employee_name, is_employed, asset.id),
    ]);

    await logAudit(env.DB, request, user, "monitor_out", "monitor_assets", asset.id, { tx_no, employee_no, employee_name, department, to_location_id, remark });
    return Response.json({ ok: true, message: "出库成功", data: { tx_no } });
  } catch (e: any) {
    return errorResponse(e);
  }
};
