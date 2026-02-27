import { createTiming } from "./_timing";

// Lightweight endpoint for warm-up/monitoring. Intentionally does NOT require auth.
export const onRequestGet: PagesFunction<{ DB: D1Database }> = async ({ env }) => {
  const t = createTiming();
  try {
    if (!env.DB) {
      const resp = Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
      resp.headers.set("Cache-Control", "no-store");
      resp.headers.set("Server-Timing", t.header());
      return resp;
    }

    await t.measure("db", async () => {
      await env.DB.prepare("SELECT 1").first();
    });

    const resp = Response.json({ ok: true, ts: Date.now() });
    resp.headers.set("Cache-Control", "no-store");
    resp.headers.set("Server-Timing", t.header());
    return resp;
  } catch (e: any) {
    const resp = Response.json({ ok: false, message: String(e?.message || e || "error") }, { status: 500 });
    resp.headers.set("Cache-Control", "no-store");
    resp.headers.set("Server-Timing", t.header());
    return resp;
  }
};
