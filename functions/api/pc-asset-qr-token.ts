import { requireAuth, errorResponse, signJwt } from "../_auth";
import { ensurePcSchemaIfAllowed } from "./_pc";

// 生成“扫码查看电脑信息”的 token（不需要额外建表/迁移）。
// 扫码打开的页面走 /public/pc-asset?token=xxx ，该页面无需登录。
// 注意：token 依赖 JWT_SECRET；若你更换 JWT_SECRET，旧二维码会失效。

// 有效期：5 年（适合贴资产标签长期使用）
const QR_TOKEN_TTL_SECONDS = 5 * 365 * 24 * 3600;

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    const t = (env as any).__timing;
    if (t?.measure) await t.measure("schema", () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    const id = Number(url.searchParams.get("id") || 0);
    if (!id) throw Object.assign(new Error("缺少资产ID"), { status: 400 });

    const asset = await env.DB.prepare("SELECT id FROM pc_assets WHERE id=?").bind(id).first<any>();
    if (!asset) throw Object.assign(new Error("电脑台账不存在或已删除"), { status: 404 });

    const token = await signJwt({ scope: "pc_view", pc_asset_id: id }, env.JWT_SECRET, QR_TOKEN_TTL_SECONDS);
    const origin = url.origin;
    const viewUrl = `${origin}/public/pc-asset?token=${encodeURIComponent(token)}`;

    return Response.json({ ok: true, token, url: viewUrl, expires_in: QR_TOKEN_TTL_SECONDS });
  } catch (e: any) {
    return errorResponse(e);
  }
};
