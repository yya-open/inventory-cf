import { errorResponse } from "../../_auth";
import {
  insertPublicInventoryLog,
  parsePublicInventoryBody,
  publicAssetSubject,
  rateLimitPublic,
  resolvePublicAssetId,
} from "../services/public-assets";

type Env = { DB: D1Database; JWT_SECRET: string };

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    await rateLimitPublic(env.DB, request, "public_monitor_inventory", publicAssetSubject(url), 8);
    const assetId = await resolvePublicAssetId({ env, request, kind: "monitor", allowToken: true });
    const payload = parsePublicInventoryBody(await request.json().catch(() => ({})));

    await insertPublicInventoryLog(env.DB, "monitor", assetId, payload.action, payload.issueType, payload.remark, request);
    return Response.json({ ok: true });
  } catch (e: any) {
    return errorResponse(e);
  }
};
