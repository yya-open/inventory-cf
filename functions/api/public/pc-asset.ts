import { errorResponse, verifyJwt } from "../../_auth";

type Env = { DB: D1Database; JWT_SECRET: string };

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
  if (Number(row?.count || 0) > limitPerMinute) {
    throw Object.assign(new Error("访问过于频繁，请稍后再试"), { status: 429 });
  }
}

function sanitizePcAsset(asset: any) {
  return {
    id: asset.id,
    brand: asset.brand || null,
    model: asset.model || null,
    serial_no: asset.serial_no || null,
    manufacture_date: asset.manufacture_date || null,
    warranty_end: asset.warranty_end || null,
    disk_capacity: asset.disk_capacity || null,
    memory_size: asset.memory_size || null,
    status: asset.status || null,
    remark: asset.remark || null,
    last_employee_no: asset.last_employee_no || null,
    last_employee_name: asset.last_employee_name || null,
    last_department: asset.last_department || null,
    last_config_date: asset.last_config_date || null,
    last_recycle_date: asset.last_recycle_date || null,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    const idParam = (url.searchParams.get("id") || "").trim();
    const keyParam = (url.searchParams.get("key") || "").trim();
    const token = (url.searchParams.get("token") || "").trim();

    let id = 0;
    let subject = token ? `token:${token.slice(0, 12)}` : `id:${idParam || 'missing'}`;

    if (idParam && keyParam) {
      id = Number(idParam || 0);
      subject = `id:${id}`;
      await rateLimit(env, request, "public_pc_asset", subject, 20);
      if (!id || !keyParam) throw Object.assign(new Error("二维码参数无效"), { status: 400 });
      const r = await env.DB.prepare("SELECT id, qr_key FROM pc_assets WHERE id=?").bind(id).first<any>();
      if (!r) throw Object.assign(new Error("电脑台账不存在或已删除"), { status: 404 });
      const dbKey = (r.qr_key || "").trim();
      if (!dbKey) throw Object.assign(new Error("该电脑尚未启用二维码（请先在系统里生成一次二维码）"), { status: 400 });
      if (dbKey !== keyParam) throw Object.assign(new Error("二维码已失效（可能已被重置）"), { status: 401 });
    } else if (token) {
      await rateLimit(env, request, "public_pc_asset", subject, 10);
      if (!env.JWT_SECRET) throw Object.assign(new Error("缺少 JWT_SECRET"), { status: 500 });
      const payload = await verifyJwt(token, env.JWT_SECRET);
      if (!payload) throw Object.assign(new Error("二维码已失效"), { status: 401 });
      if (payload.scope !== "pc_view") throw Object.assign(new Error("二维码无效"), { status: 401 });
      id = Number(payload.pc_asset_id || 0);
      if (!id) throw Object.assign(new Error("二维码无效"), { status: 401 });
    } else {
      throw Object.assign(new Error("缺少二维码参数"), { status: 400 });
    }

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
        a.id, a.brand, a.serial_no, a.model,
        a.manufacture_date, a.warranty_end, a.disk_capacity, a.memory_size,
        a.remark, a.status,
        o.employee_no AS last_employee_no,
        o.employee_name AS last_employee_name,
        o.department AS last_department,
        o.config_date AS last_config_date,
        r.recycle_date AS last_recycle_date
      FROM pc_assets a
      LEFT JOIN latest_out lo ON lo.asset_id = a.id
      LEFT JOIN pc_out o ON o.id = lo.max_id
      LEFT JOIN latest_recycle lr ON lr.asset_id = a.id
      LEFT JOIN pc_recycle r ON r.id = lr.max_id
      WHERE a.id=?
      LIMIT 1
      `
    ).bind(id, id, id).first<any>();

    if (!asset) throw Object.assign(new Error("电脑台账不存在或已删除"), { status: 404 });
    return Response.json({ ok: true, data: sanitizePcAsset(asset) });
  } catch (e: any) {
    return errorResponse(e);
  }
};
