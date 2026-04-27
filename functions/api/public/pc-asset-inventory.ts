import { errorResponse } from "../../_auth";
import {
  insertPublicInventoryLog,
  parsePublicInventoryBody,
  publicAssetSubject,
  rateLimitPublic,
  resolvePublicAssetId,
} from "../services/public-assets";

type Env = { DB: D1Database; JWT_SECRET: string };
type TimingLike = { measure?: <T>(name: string, fn: () => Promise<T> | T) => Promise<T> } | null;

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const timing = ((env as any).__timing || null) as TimingLike;

    const url = new URL(request.url);
    if (timing?.measure) {
      await timing.measure('public_pc_inventory_rate_limit', () => rateLimitPublic(env.DB, request, "public_pc_inventory", publicAssetSubject(url), 8));
    } else {
      await rateLimitPublic(env.DB, request, "public_pc_inventory", publicAssetSubject(url), 8);
    }
    const assetId = timing?.measure
      ? await timing.measure('public_pc_inventory_resolve_id', () => resolvePublicAssetId({ env, request, kind: "pc", allowToken: true }))
      : await resolvePublicAssetId({ env, request, kind: "pc", allowToken: true });
    const payload = timing?.measure
      ? await timing.measure('public_pc_inventory_parse_body', async () => parsePublicInventoryBody(await request.json().catch(() => ({}))))
      : parsePublicInventoryBody(await request.json().catch(() => ({})));

    if (timing?.measure) {
      await timing.measure('public_pc_inventory_insert_log', () => insertPublicInventoryLog(env.DB, "pc", assetId, payload.action, payload.issueType, payload.remark, request));
    } else {
      await insertPublicInventoryLog(env.DB, "pc", assetId, payload.action, payload.issueType, payload.remark, request);
    }
    return Response.json({ ok: true });
  } catch (e: any) {
    return errorResponse(e);
  }
};
