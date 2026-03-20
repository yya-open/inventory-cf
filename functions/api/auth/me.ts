import { json, requireAuth, errorResponse } from "../../_auth";
import { getUserPermissionMap } from '../../_permissions';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "viewer");
    const permissions = await getUserPermissionMap(env.DB, user.id, user.role);
    return json(true, { user: { ...user, permissions } });
  } catch (e: any) {
    return errorResponse(e);
  }
};
