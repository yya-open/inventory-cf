import { requireAuth, errorResponse } from "../_auth";
import { ensurePcSchemaIfAllowed } from "./_pc";

function genKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

// POST /api/pc-assets-reset-qr?id=123
// 管理员重置二维码：生成新 qr_key，使旧二维码立即失效
export const onRequestPost: PagesFunction<{ DB: D1Database }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    const t = (env as any).__timing;
    if (t?.measure) await t.measure("schema", () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    const id = Number(url.searchParams.get("id") || 0);
    if (!id) throw Object.assign(new Error("缺少资产ID"), { status: 400 });

    const asset = await env.DB.prepare("SELECT id FROM pc_assets WHERE id=?").bind(id).first<any>();
    if (!asset) throw Object.assign(new Error("电脑台账不存在或已删除"), { status: 404 });

    const key = genKey();
    await env.DB.prepare("UPDATE pc_assets SET qr_key=?, qr_updated_at=datetime('now','+8 hours'), updated_at=datetime('now','+8 hours') WHERE id=?")
      .bind(key, id)
      .run();

    const origin = url.origin;
    const viewUrl = `${origin}/public/pc-asset?id=${encodeURIComponent(String(id))}&key=${encodeURIComponent(key)}`;
    return Response.json({ ok: true, id, key, url: viewUrl });
  } catch (e: any) {
    return errorResponse(e);
  }
};
