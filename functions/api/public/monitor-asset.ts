import { errorResponse } from "../../_auth";

type Env = { DB: D1Database };

function getClientIp(request: Request) {
  const h = request.headers;
  return h.get("CF-Connecting-IP") || h.get("X-Forwarded-For")?.split(",")[0]?.trim() || "";
}

async function rateLimit(env: Env, request: Request, route: string, subject: string, limitPerMinute: number) {
  const ip = getClientIp(request) || "unknown";
  const minuteBucket = Math.floor(Date.now() / 60000);
  const key = `${route}|${subject}|${ip}|${minuteBucket}`;

  if ((Date.now() & 63) === 0) {
    await env.DB.prepare("DELETE FROM public_api_throttle WHERE updated_at < datetime('now','+8 hours', '-2 hours')").run();
  }

  await env.DB.prepare(
    "INSERT INTO public_api_throttle (k, count) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET count = count + 1, updated_at = datetime('now','+8 hours')"
  ).bind(key).run();

  const row = await env.DB.prepare("SELECT count FROM public_api_throttle WHERE k=?").bind(key).first<any>();
  if (Number(row?.count || 0) > limitPerMinute) throw Object.assign(new Error("访问过于频繁，请稍后再试"), { status: 429 });
}

function sanitizeMonitorAsset(asset: any) {
  return {
    id: asset.id,
    asset_code: asset.asset_code || null,
    sn: asset.sn || null,
    brand: asset.brand || null,
    model: asset.model || null,
    size_inch: asset.size_inch || null,
    status: asset.status || null,
    location_name: asset.location_name || null,
    parent_location_name: asset.parent_location_name || null,
    department: asset.department || null,
    employee_no: asset.employee_no || null,
    employee_name: asset.employee_name || null,
    is_employed: asset.is_employed ?? null,
    remark: asset.remark || null,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    const id = Number((url.searchParams.get("id") || "").trim() || 0);
    const key = (url.searchParams.get("key") || "").trim();
    await rateLimit(env, request, "public_monitor_asset", `id:${id || 'missing'}`, 20);
    if (!id || !key) throw Object.assign(new Error("缺少二维码参数"), { status: 400 });

    let r: any;
    try {
      r = await env.DB.prepare("SELECT id, qr_key FROM monitor_assets WHERE id=?").bind(id).first<any>();
    } catch (err: any) {
      const msg = String(err?.message || err || "");
      if (msg.includes("no such column") && msg.includes("qr_key")) {
        throw Object.assign(new Error("数据库未升级：缺少二维码字段，请管理员先在后台点击一次‘二维码’或执行初始化"), { status: 500 });
      }
      throw err;
    }
    if (!r) throw Object.assign(new Error("显示器台账不存在或已删除"), { status: 404 });
    const dbKey = String(r.qr_key || "").trim();
    if (!dbKey) throw Object.assign(new Error("该显示器尚未启用二维码（请先在系统里生成一次二维码）"), { status: 400 });
    if (dbKey !== key) throw Object.assign(new Error("二维码已失效（可能已被重置）"), { status: 401 });

    const asset = await env.DB.prepare(
      `
      SELECT
        a.id, a.asset_code, a.sn, a.brand, a.model, a.size_inch, a.remark, a.status,
        a.department, a.employee_no, a.employee_name, a.is_employed,
        l.name AS location_name,
        p.name AS parent_location_name
      FROM monitor_assets a
      LEFT JOIN pc_locations l ON l.id = a.location_id
      LEFT JOIN pc_locations p ON p.id = l.parent_id
      WHERE a.id=?
      LIMIT 1
      `
    ).bind(id).first<any>();

    if (!asset) throw Object.assign(new Error("显示器台账不存在或已删除"), { status: 404 });
    return Response.json({ ok: true, data: sanitizeMonitorAsset(asset) });
  } catch (e: any) {
    return errorResponse(e);
  }
};
