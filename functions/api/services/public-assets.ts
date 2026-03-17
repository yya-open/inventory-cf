import { verifyJwt } from "../_auth";
import { sqlNowStored, sqlStoredHoursAgo } from "../_time";

export type PublicAssetKind = "pc" | "monitor";

type ResolvePublicAssetArgs = {
  env: { DB: D1Database; JWT_SECRET?: string };
  request: Request;
  kind: PublicAssetKind;
  allowToken?: boolean;
};

const PUBLIC_INVENTORY_ISSUE_TYPES = new Set([
  "NOT_FOUND",
  "WRONG_LOCATION",
  "WRONG_QR",
  "WRONG_STATUS",
  "MISSING",
  "OTHER",
]);

const ASSET_CONFIG: Record<PublicAssetKind, {
  assetTable: "pc_assets" | "monitor_assets";
  label: string;
  scope: "pc_view" | "monitor_view";
  tokenField: "pc_asset_id" | "monitor_asset_id";
}> = {
  pc: {
    assetTable: "pc_assets",
    label: "电脑台账",
    scope: "pc_view",
    tokenField: "pc_asset_id",
  },
  monitor: {
    assetTable: "monitor_assets",
    label: "显示器台账",
    scope: "monitor_view",
    tokenField: "monitor_asset_id",
  },
};

export function getClientIp(request: Request) {
  const h = request.headers;
  return h.get("CF-Connecting-IP") || h.get("X-Forwarded-For")?.split(",")[0]?.trim() || "";
}

export async function ensurePublicThrottleTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS public_api_throttle (
      k TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()})
    )`
  ).run();
}

export async function rateLimitPublic(db: D1Database, request: Request, route: string, subject: string, limitPerMinute: number) {
  await ensurePublicThrottleTable(db);

  const ip = getClientIp(request) || "unknown";
  const minuteBucket = Math.floor(Date.now() / 60000);
  const key = `${route}|${subject}|${ip}|${minuteBucket}`;

  if ((Date.now() & 63) === 0) {
    await db.prepare(`DELETE FROM public_api_throttle WHERE updated_at < ${sqlStoredHoursAgo(2)}`).run();
  }

  await db
    .prepare(
      `INSERT INTO public_api_throttle (k, count) VALUES (?, 1)
       ON CONFLICT(k) DO UPDATE SET count = count + 1, updated_at = ${sqlNowStored()}`
    )
    .bind(key)
    .run();

  const row = await db.prepare("SELECT count FROM public_api_throttle WHERE k=?").bind(key).first<any>();
  if (Number(row?.count || 0) > limitPerMinute) {
    throw Object.assign(new Error("访问过于频繁，请稍后再试"), { status: 429 });
  }
}

export function parsePublicInventoryBody(body: any) {
  const action = String(body?.action || "").toUpperCase();
  const issueType = String(body?.issue_type || "").toUpperCase();
  const remark = String(body?.remark || "").slice(0, 500).trim();

  if (action !== "OK" && action !== "ISSUE") {
    throw Object.assign(new Error("action 参数无效"), { status: 400 });
  }
  if (action === "ISSUE" && !PUBLIC_INVENTORY_ISSUE_TYPES.has(issueType)) {
    throw Object.assign(new Error("issue_type 参数无效"), { status: 400 });
  }

  return {
    action,
    issueType: action === "ISSUE" ? issueType : null,
    remark: remark || null,
  };
}

export function publicAssetSubject(url: URL) {
  return url.searchParams.get("id") || url.searchParams.get("token")?.slice(0, 12) || "unknown";
}

export async function resolvePublicAssetId(args: ResolvePublicAssetArgs) {
  const { env, request, kind } = args;
  const allowToken = args.allowToken !== false;
  const cfg = ASSET_CONFIG[kind];
  const url = new URL(request.url);
  const idParam = String(url.searchParams.get("id") || "").trim();
  const keyParam = String(url.searchParams.get("key") || "").trim();
  const token = String(url.searchParams.get("token") || "").trim();

  if (idParam && keyParam) {
    const id = Number(idParam || 0);
    if (!id || !keyParam) {
      throw Object.assign(new Error("二维码参数无效"), { status: 400 });
    }
    const row = await env.DB.prepare(`SELECT id, qr_key FROM ${cfg.assetTable} WHERE id=?`).bind(id).first<any>();
    if (!row) {
      throw Object.assign(new Error(`${cfg.label}不存在或已删除`), { status: 404 });
    }
    const dbKey = String(row.qr_key || "").trim();
    if (!dbKey) {
      throw Object.assign(new Error(`该${kind === "pc" ? "电脑" : "显示器"}尚未启用二维码（请先在系统里生成一次二维码）`), { status: 400 });
    }
    if (dbKey !== keyParam) {
      throw Object.assign(new Error("二维码已失效（可能已被重置）"), { status: 401 });
    }
    return id;
  }

  if (allowToken && token) {
    if (!env.JWT_SECRET) {
      throw Object.assign(new Error("缺少 JWT_SECRET"), { status: 500 });
    }
    const payload = await verifyJwt(token, env.JWT_SECRET);
    if (!payload) {
      throw Object.assign(new Error("二维码已失效"), { status: 401 });
    }
    if (payload.scope !== cfg.scope) {
      throw Object.assign(new Error("二维码无效"), { status: 401 });
    }
    const id = Number(payload[cfg.tokenField] || 0);
    if (!id) {
      throw Object.assign(new Error("二维码无效"), { status: 401 });
    }
    return id;
  }

  throw Object.assign(new Error("缺少二维码参数"), { status: 400 });
}

export async function insertPublicInventoryLog(
  db: D1Database,
  kind: PublicAssetKind,
  assetId: number,
  action: string,
  issueType: string | null,
  remark: string | null,
  request: Request,
) {
  const table = kind === "pc" ? "pc_inventory_log" : "monitor_inventory_log";
  const ip = getClientIp(request) || "";
  const ua = (request.headers.get("User-Agent") || "").slice(0, 300);

  await db
    .prepare(
      `INSERT INTO ${table} (asset_id, action, issue_type, remark, ip, ua, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ${sqlNowStored()})`
    )
    .bind(assetId, action, issueType, remark, ip, ua)
    .run();
}
