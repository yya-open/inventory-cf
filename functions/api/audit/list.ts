import { requireAuth, errorResponse } from "../../_auth";
import { countAuditRows, listAuditRows, parseAuditListFilters } from "../services/audit-log";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");
    const filters = parseAuditListFilters(new URL(request.url));
    const total = await countAuditRows(env.DB, filters);
    const data = await listAuditRows(env.DB, filters);
    return Response.json({ ok: true, data, total, page: filters.page, pageSize: filters.pageSize });
  } catch (e: any) {
    return errorResponse(e);
  }
};
