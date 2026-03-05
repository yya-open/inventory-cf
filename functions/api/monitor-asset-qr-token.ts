import { requireAuth, errorResponse } from "../_auth";
import { ensureMonitorSchemaIfAllowed } from "./_monitor";

function genKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

// GET /api/monitor-asset-qr-token?id=123
// 生成“扫码查看显示器信息”的长期二维码（可控可撤销，机制同电脑二维码：id + qr_key）
export const onRequestGet: PagesFunction<{ DB: D1Database }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    const t = (env as any).__timing;
    if (t?.measure) await t.measure("schema", () => ensureMonitorSchemaIfAllowed(env.DB, env, url));
    else await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const id = Number(url.searchParams.get("id") || 0);
    if (!id) throw Object.assign(new Error("缺少资产ID"), { status: 400 });

    const row = await env.DB.prepare("SELECT id, qr_key FROM monitor_assets WHERE id=?").bind(id).first<any>();
    if (!row) throw Object.assign(new Error("显示器台账不存在或已删除"), { status: 404 });

    let key = (row.qr_key || "").trim();
    if (!key) {
      key = genKey();
      await env.DB
        .prepare("UPDATE monitor_assets SET qr_key=?, qr_updated_at=datetime('now','+8 hours'), updated_at=datetime('now','+8 hours') WHERE id=?")
        .bind(key, id)
        .run();
    }

    const origin = url.origin;
    const viewUrl = `${origin}/public/monitor-asset?id=${encodeURIComponent(String(id))}&key=${encodeURIComponent(key)}`;

    return Response.json({ ok: true, id, key, url: viewUrl });
  } catch (e: any) {
    return errorResponse(e);
  }
};
