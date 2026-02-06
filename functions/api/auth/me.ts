import type { PagesFunction } from "@cloudflare/workers-types";
import { json, requireAuth } from "../_auth";

export const onRequestGet: PagesFunction = async (ctx) => {
  try {
    const auth = await requireAuth(ctx.request, ctx.env, "viewer");
    if (!auth.ok) return auth.res;

    // 这里故意不查 DB，只返回 token 解出来的 user，先确保不再 1101
    return json({ ok: true, user: auth.user });
  } catch (e: any) {
    // 把异常变成 JSON，避免 1101，方便你继续定位
    return json(
      { ok: false, message: "auth/me crashed", detail: String(e?.stack || e) },
      { status: 500 }
    );
  }
};
