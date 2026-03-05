import { requireAuth, errorResponse } from "../_auth";
import { ensureMonitorSchemaIfAllowed, ensureMonitorQrColumns } from "./_monitor";

function genKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

// POST /api/monitor-assets-init-qr-keys
// 管理员：批量为缺少 qr_key 的显示器补齐 qr_key（便于提前贴码/批量导出）
export const onRequestPost: PagesFunction<{ DB: D1Database }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    const t = (env as any).__timing;
    if (t?.measure) await t.measure("schema", () => ensureMonitorSchemaIfAllowed(env.DB, env, url));
    else await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    await ensureMonitorQrColumns(env.DB);

    const body = await request.json<any>().catch(() => ({} as any));
    const batchSize = Math.min(200, Math.max(10, Number(body?.batch_size || 50)));

    // 取一批缺失 qr_key 的 id
    const { results } = await env.DB
      .prepare("SELECT id FROM monitor_assets WHERE qr_key IS NULL OR TRIM(qr_key)='' ORDER BY id ASC LIMIT ?")
      .bind(batchSize)
      .all<any>();

    let updated = 0;
    for (const r of results || []) {
      const id = Number(r.id || 0);
      if (!id) continue;
      const key = genKey();
      const res = await env.DB
        .prepare(
          "UPDATE monitor_assets SET qr_key=?, qr_updated_at=datetime('now','+8 hours'), updated_at=datetime('now','+8 hours') WHERE id=? AND (qr_key IS NULL OR TRIM(qr_key)='')"
        )
        .bind(key, id)
        .run();
      if (Number(res?.meta?.changes || 0) > 0) updated += 1;
    }

    return Response.json({ ok: true, updated, message: updated ? `已补齐 ${updated} 条` : "无需补齐" });
  } catch (e: any) {
    return errorResponse(e);
  }
};
