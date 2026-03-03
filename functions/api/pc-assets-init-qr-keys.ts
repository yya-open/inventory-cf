import { requireAuth, errorResponse } from "../_auth";
import { ensurePcSchemaIfAllowed } from "./_pc";

function genKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

// POST /api/pc-assets-init-qr-keys?batch=200
// 管理员：批量为没有 qr_key 的电脑补齐 qr_key（便于提前贴码/批量导出）
export const onRequestPost: PagesFunction<{ DB: D1Database }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    const t = (env as any).__timing;
    if (t?.measure) await t.measure("schema", () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    const batch = Math.max(1, Math.min(500, Number(url.searchParams.get("batch") || 200)));

    // 取一批缺失 qr_key 的 id
    const ids = await env.DB.prepare("SELECT id FROM pc_assets WHERE qr_key IS NULL OR TRIM(qr_key)='' ORDER BY id ASC LIMIT ?")
      .bind(batch)
      .all<any>();

    const list = (ids?.results || []).map((r: any) => Number(r.id)).filter((n: any) => n > 0);
    if (list.length === 0) return Response.json({ ok: true, updated: 0 });

    // 批量更新（D1 batch）
    const stmts: D1PreparedStatement[] = [];
    for (const id of list) {
      const key = genKey();
      stmts.push(
        env.DB.prepare("UPDATE pc_assets SET qr_key=?, qr_updated_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND (qr_key IS NULL OR TRIM(qr_key)='')")
          .bind(key, id)
      );
    }
    await env.DB.batch(stmts);

    return Response.json({ ok: true, updated: list.length });
  } catch (e: any) {
    return errorResponse(e);
  }
};
