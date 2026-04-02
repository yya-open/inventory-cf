import { json, requireAuth, errorResponse } from "../../_auth";
import { getUserPermissionMap, getUserTemplateCode } from '../../_permissions';
import { getUserDataScope } from '../services/data-scope';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "viewer");
    const permission_template_code = await getUserTemplateCode(env.DB, user.id, user.role);
    const permissions = await getUserPermissionMap(env.DB, user.id, user.role, permission_template_code);
    const dataScope = await getUserDataScope(env.DB, user.id);
    return json(true, { user: { ...user, permission_template_code, permissions, ...dataScope } });
  } catch (e: any) {
    return errorResponse(e);
  }
};
