import { errorResponse, verifyJwt } from "../../_auth";
import { ensureMonitorSchema } from "../_monitor";

type Env = { DB: D1Database; JWT_SECRET: string };

function getClientIp(request: Request) {
  const h = request.headers;
  return h.get("CF-Connecting-IP") || h.get("X-Forwarded-For")?.split(",")[0]?.trim() || "";
}

async function rateLimit(env: Env, request: Request, route: string, limitPerMinute: number) {
  const ip = getClientIp(request) || "unknown";
  const minuteBucket = Math.floor(Date.now() / 60000);
  const subject = new URL(request.url).searchParams.get("id") || new URL(request.url).searchParams.get("token")?.slice(0,12) || "unknown";
  const k = `${route}|${subject}|${ip}|${minuteBucket}`;

  // ensure throttle table exists (best-effort)
  try {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS public_api_throttle (k TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')))"
    ).run();
  } catch {
    // ignore
  }

  // best-effort cleanup (avoid table growth)
  if ((Date.now() & 63) === 0) {
    await env.DB.prepare("DELETE FROM public_api_throttle WHERE updated_at < datetime('now','+8 hours', '-2 hours')").run();
  }

  await env.DB.prepare(
    "INSERT INTO public_api_throttle (k, count) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET count = count + 1, updated_at = datetime('now','+8 hours')"
  )
    .bind(k)
    .run();

  const row = await env.DB.prepare("SELECT count FROM public_api_throttle WHERE k=?").bind(k).first<any>();
  const c = Number(row?.count || 0);
  if (c > limitPerMinute) {
    throw Object.assign(new Error("访问过于频繁，请稍后再试"), { status: 429 });
  }
}

async function resolveMonitorAssetId(env: Env, request: Request) {
  const url = new URL(request.url);
  const idParam = (url.searchParams.get("id") || "").trim();
  const keyParam = (url.searchParams.get("key") || "").trim();
  const token = (url.searchParams.get("token") || "").trim();

  if (idParam && keyParam) {
    const id = Number(idParam || 0);
    const key = keyParam;
    if (!id || !key) throw Object.assign(new Error("二维码参数无效"), { status: 400 });

    // ensure schema (so qr_key exists)
    try {
      await ensureMonitorSchema(env.DB);
    } catch {
      // ignore
    }

    const r = await env.DB.prepare("SELECT id, qr_key FROM monitor_assets WHERE id=?").bind(id).first<any>();
    if (!r) throw Object.assign(new Error("显示器台账不存在或已删除"), { status: 404 });
    const dbKey = (r.qr_key || "").trim();
    if (!dbKey) throw Object.assign(new Error("该显示器尚未启用二维码"), { status: 400 });
    if (dbKey !== key) throw Object.assign(new Error("二维码已失效（可能已被重置）"), { status: 401 });
    return id;
  }

  if (token) {
    if (!env.JWT_SECRET) throw Object.assign(new Error("缺少 JWT_SECRET"), { status: 500 });
    const payload = await verifyJwt(token, env.JWT_SECRET);
    if (!payload) throw Object.assign(new Error("二维码已失效"), { status: 401 });
    if (payload.scope !== "monitor_view") throw Object.assign(new Error("二维码无效"), { status: 401 });
    const id = Number(payload.monitor_asset_id || 0);
    if (!id) throw Object.assign(new Error("二维码无效"), { status: 401 });
    return id;
  }

  throw Object.assign(new Error("缺少二维码参数"), { status: 400 });
}

// 公开盘点提交接口（扫码页按钮用）
// POST /api/public/monitor-asset-inventory?id=1&key=xxxx
// body: { action: 'OK' } | { action: 'ISSUE', issue_type: 'NOT_FOUND'|'WRONG_LOCATION'|'WRONG_QR'|'WRONG_STATUS'|'MISSING'|'OTHER', remark?: string }
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    await rateLimit(env, request, "public_monitor_inventory", 8);

    const assetId = await resolveMonitorAssetId(env, request);

    const body = (await request.json().catch(() => ({}))) as any;
    const action = String(body?.action || "").toUpperCase();
    const issueType = String(body?.issue_type || "").toUpperCase();
    const remark = String(body?.remark || "").slice(0, 500);

    if (action !== "OK" && action !== "ISSUE") {
      throw Object.assign(new Error("action 参数无效"), { status: 400 });
    }

    const allowedIssueTypes = new Set(["NOT_FOUND", "WRONG_LOCATION", "WRONG_QR", "WRONG_STATUS", "MISSING", "OTHER"]);
    if (action === "ISSUE" && !allowedIssueTypes.has(issueType)) {
      throw Object.assign(new Error("issue_type 参数无效"), { status: 400 });
    }

    const ip = getClientIp(request) || "";
    const ua = (request.headers.get("User-Agent") || "").slice(0, 300);

    // ensure inventory log table exists (best-effort)
    try {
      await ensureMonitorSchema(env.DB);
    } catch {
      // ignore
    }

    await env.DB.prepare(
      "INSERT INTO monitor_inventory_log (asset_id, action, issue_type, remark, ip, ua, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now','+8 hours'))"
    )
      .bind(assetId, action, action === "ISSUE" ? issueType : null, remark || null, ip, ua)
      .run();

    return Response.json({ ok: true });
  } catch (e: any) {
    return errorResponse(e);
  }
};
