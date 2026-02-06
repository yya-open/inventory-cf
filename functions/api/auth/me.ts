import { json, requireAuth, errorResponse } from "../../_auth";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  const user = await requireAuth(env, request, "viewer");
  return json(true, { user });
};
