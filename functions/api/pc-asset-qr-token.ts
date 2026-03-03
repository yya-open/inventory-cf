import { requireAuth, errorResponse } from "../_auth";
import { ensurePcSchemaIfAllowed } from "./_pc";

// 生成“扫码查看电脑信息”的长期二维码（可控可撤销）。
// 机制：二维码里包含 id + qr_key；扫码接口会校验 qr_key。
// 优点：
// - 信息实时从数据库读取（你更新信息后扫码会自动显示最新）
// - 不依赖 JWT_SECRET（你更换 JWT_SECRET 不会影响已贴的二维码）
// - 管理员可“重置二维码”，旧码立即作废
//
// 注意：需要先执行迁移：sql/migrate_pc_qr_key.sql（为 pc_assets 增加 qr_key/qr_updated_at）

function genKey() {
  // 20 bytes => base64url ~ 27 chars，够用且短
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  // base64url
  let s = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return s;
}

export const onRequestGet: PagesFunction<{ DB: D1Database }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    const t = (env as any).__timing;
    if (t?.measure) await t.measure("schema", () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    const id = Number(url.searchParams.get("id") || 0);
    if (!id) throw Object.assign(new Error("缺少资产ID"), { status: 400 });

    // 取出当前 qr_key（可能为空）
    const row = await env.DB.prepare("SELECT id, qr_key FROM pc_assets WHERE id=?").bind(id).first<any>();
    if (!row) throw Object.assign(new Error("电脑台账不存在或已删除"), { status: 404 });

    let key = (row.qr_key || "").trim();
    if (!key) {
      key = genKey();
      // 写入 key（并记录更新时间）
      await env.DB.prepare("UPDATE pc_assets SET qr_key=?, qr_updated_at=datetime('now'), updated_at=datetime('now') WHERE id=?")
        .bind(key, id)
        .run();
    }

    const origin = url.origin;
    const viewUrl = `${origin}/public/pc-asset?id=${encodeURIComponent(String(id))}&key=${encodeURIComponent(key)}`;

    return Response.json({ ok: true, id, key, url: viewUrl });
  } catch (e: any) {
    return errorResponse(e);
  }
};
