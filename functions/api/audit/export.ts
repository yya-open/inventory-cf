import { requireAuth, errorResponse } from "../../_auth";
import { countAuditRows, listAuditRows, parseAuditListFilters } from "../services/audit-log";

const MAX_EXPORT_ROWS = 5000;

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");
    const url = new URL(request.url);
    const filters = parseAuditListFilters(url);
    const scope = String(url.searchParams.get('scope') || 'all').trim().toLowerCase();
    const maxRows = Math.max(1, Math.min(MAX_EXPORT_ROWS, Number(url.searchParams.get('max_rows') || MAX_EXPORT_ROWS)));
    const total = await countAuditRows(env.DB, filters);
    const isCurrent = scope === 'current';
    const limit = isCurrent ? filters.pageSize : Math.min(total || 0, maxRows);
    const offset = isCurrent ? filters.offset : 0;
    const data = limit > 0 ? await listAuditRows(env.DB, filters, { limit, offset }) : [];
    return Response.json({ ok: true, data, total, limited: !isCurrent && total > maxRows, exported: data.length, scope: isCurrent ? 'current' : 'all', maxRows });
  } catch (e: any) {
    return errorResponse(e);
  }
};
