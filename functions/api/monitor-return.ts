import { requireAuth, errorResponse } from "../_auth";
import { ensureMonitorSchemaIfAllowed, monitorTxNo } from "./_monitor";
import { optional, normalizeText } from "./_pc";
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

    const to_location_id = Number(body?.location_id || body?.to_location_id || 0) || null;
    const remark = optional(body?.remark, 1000);

    const asset = asset_id
      ? await env.DB.prepare("SELECT * FROM monitor_assets WHERE id=?").bind(asset_id).first<any>()
      : await env.DB.prepare("SELECT * FROM monitor_assets WHERE asset_code=?").bind(asset_code).first<any>();
    if (!asset) throw Object.assign(new Error("显示器台账不存在"), { status: 404 });
    if (String(asset.status) === "SCRAPPED") throw Object.assign(new Error("该资产已报废，无法归还"), { status: 400 });
    if (String(asset.status) !== "ASSIGNED") throw Object.assign(new Error("该资产当前不是已领用状态，无需归还"), { status: 400 });

    const tx_no = monitorTxNo("MONRET");
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
          "RETURN",
          asset.id,
          asset.asset_code,
          asset.sn,
          asset.brand,
          asset.model,
          asset.size_inch,
          asset.location_id,
          to_location_id,
          asset.employee_no,
          asset.department,
          asset.employee_name,
          asset.is_employed,
          remark,
          user.username,
          ip,
          ua
        ),
      env.DB
        .prepare(
          `UPDATE monitor_assets
           SET status='IN_STOCK', location_id=?, employee_no=NULL, department=NULL, employee_name=NULL, is_employed=NULL,
               updated_at=datetime('now','+8 hours')
           WHERE id=?`
        )
        .bind(to_location_id, asset.id),
    ]);

    await logAudit(env.DB, request, user, "monitor_return", "monitor_assets", asset.id, { tx_no, to_location_id, remark });
    return Response.json({ ok: true, message: "归还成功", data: { tx_no } });
  } catch (e: any) {
    return errorResponse(e);
  }
};
