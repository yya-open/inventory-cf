import { errorResponse, verifyJwt } from "../../_auth";

// 公开（无需登录）接口：通过二维码 token 获取电脑信息
// GET /api/public/pc-asset?token=...

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const url = new URL(request.url);
    const token = (url.searchParams.get("token") || "").trim();
    if (!token) throw Object.assign(new Error("缺少 token"), { status: 400 });
    if (!env.JWT_SECRET) throw Object.assign(new Error("缺少 JWT_SECRET"), { status: 500 });

    const payload = await verifyJwt(token, env.JWT_SECRET);
    if (!payload) throw Object.assign(new Error("二维码已失效"), { status: 401 });
    if (payload.scope !== "pc_view") throw Object.assign(new Error("二维码无效"), { status: 401 });

    const id = Number(payload.pc_asset_id || 0);
    if (!id) throw Object.assign(new Error("二维码无效"), { status: 401 });

    // 取资产 + 最近一次领用/回收信息（与列表页保持一致）
    const asset = await env.DB.prepare(
      `
      WITH latest_out AS (
        SELECT asset_id, MAX(id) AS max_id
        FROM pc_out
        WHERE asset_id=?
        GROUP BY asset_id
      ),
      latest_recycle AS (
        SELECT asset_id, MAX(id) AS max_id
        FROM pc_recycle
        WHERE asset_id=?
        GROUP BY asset_id
      )
      SELECT
        a.*,
        o.employee_no   AS last_employee_no,
        o.employee_name AS last_employee_name,
        o.department    AS last_department,
        o.config_date   AS last_config_date,
        r.recycle_date  AS last_recycle_date
      FROM pc_assets a
      LEFT JOIN latest_out lo ON lo.asset_id = a.id
      LEFT JOIN pc_out o ON o.id = lo.max_id
      LEFT JOIN latest_recycle lr ON lr.asset_id = a.id
      LEFT JOIN pc_recycle r ON r.id = lr.max_id
      WHERE a.id=?
      LIMIT 1
      `
    )
      .bind(id, id, id)
      .first<any>();

    if (!asset) throw Object.assign(new Error("电脑台账不存在或已删除"), { status: 404 });

    return Response.json({ ok: true, data: asset });
  } catch (e: any) {
    return errorResponse(e);
  }
};
