import type { AuthUser } from "../_auth";

function getIp(request: Request) {
  const h = request.headers;
  const cf = h.get("CF-Connecting-IP") || h.get("cf-connecting-ip");
  const xff = h.get("x-forwarded-for");
  if (cf) return cf;
  if (xff) return xff.split(",")[0].trim();
  return null;
}

export async function logAudit(
  db: D1Database,
  request: Request,
  user: AuthUser | null,
  action: string,
  entity?: string | null,
  entity_id?: string | number | null,
  payload?: any
) {
  try {
    const ip = getIp(request);
    const ua = request.headers.get("user-agent");
    const payload_json = payload === undefined ? null : JSON.stringify(payload);
    await db.prepare(
      `INSERT INTO audit_log (user_id, username, action, entity, entity_id, payload_json, ip, ua)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(
      user?.id ?? null,
      user?.username ?? null,
      action,
      entity ?? null,
      entity_id === undefined || entity_id === null ? null : String(entity_id),
      payload_json,
      ip,
      ua
    ).run();
  } catch {
    // best-effort audit; do not block business flows
  }
}
