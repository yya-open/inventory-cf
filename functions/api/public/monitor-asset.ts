import { errorResponse } from "../../_auth";

type Env = { DB: D1Database };

function getClientIp(request: Request) {
  const h = request.headers;
  return h.get("CF-Connecting-IP") || h.get("X-Forwarded-For")?.split(",")[0]?.trim() || "";
}

async function rateLimit(env: Env, request: Request, route: string, limitPerMinute: number) {
  const ip = getClientIp(request) || "unknown";
  const minuteBucket = Math.floor(Date.now() / 60000);
  const k = `${route}|${ip}|${minuteBucket}`;

  // best-effort cleanup
  if ((Date.now() & 63) === 0) {
    await env.DB.prepare("DELETE FROM public_api_throttle WHERE updated_at < datetime('now','+8 hours', '-2 hours')").run();
  }

  await env.DB
    .prepare(
      "INSERT INTO public_api_throttle (k, count) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET count = count + 1, updated_at = datetime('now','+8 hours')"
    )
    .bind(k)
    .run();

  const row = await env.DB.prepare("SELECT count FROM public_api_throttle WHERE k=?").bind(k).first<any>();
  const c = Number(row?.count || 0);
  if (c > limitPerMinute) throw Object.assign(new Error("访问过于频繁，请稍后再试"), { status: 429 });
}

// 公开（无需登录）接口：扫码查看显示器信息
// GET /api/public/monitor-asset?id=1&key=xxxx
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    await rateLimit(env, request, "public_monitor_asset", 30);

    const url = new URL(request.url);
    const id = Number((url.searchParams.get("id") || "").trim() || 0);
    const key = (url.searchParams.get("key") || "").trim();
    if (!id || !key) throw Object.assign(new Error("缺少二维码参数"), { status: 400 });

    const r = await env.DB.prepare("SELECT id, qr_key FROM monitor_assets WHERE id=?").bind(id).first<any>();
    if (!r) throw Object.assign(new Error("显示器台账不存在或已删除"), { status: 404 });
    const dbKey = String(r.qr_key || "").trim();
    if (!dbKey) throw Object.assign(new Error("该显示器尚未启用二维码（请先在系统里生成一次二维码）"), { status: 400 });
    if (dbKey !== key) throw Object.assign(new Error("二维码已失效（可能已被重置）"), { status: 401 });

    const asset = await env.DB
      .prepare(
        `
        SELECT
          a.*,
          l.name AS location_name,
          p.name AS parent_location_name
        FROM monitor_assets a
        LEFT JOIN pc_locations l ON l.id = a.location_id
        LEFT JOIN pc_locations p ON p.id = l.parent_id
        WHERE a.id=?
        LIMIT 1
        `
      )
      .bind(id)
      .first<any>();

    if (!asset) throw Object.assign(new Error("显示器台账不存在或已删除"), { status: 404 });

    // hide qr fields
    delete (asset as any).qr_key;

    return Response.json({ ok: true, data: asset });
  } catch (e: any) {
    return errorResponse(e);
  }
};
