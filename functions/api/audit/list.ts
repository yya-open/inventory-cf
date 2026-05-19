import { withErrorHandling } from '../_error';
import { requirePermission } from '../../_permissions';
import { countAuditRows, listAuditRows, parseAuditListFilters } from "../services/audit-log";

export const onRequestGet = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  await requirePermission(env, request, 'audit_export', 'viewer');
  const filters = parseAuditListFilters(new URL(request.url));
  const [total, data] = await Promise.all([
    countAuditRows(env.DB, filters),
    listAuditRows(env.DB, filters),
  ]);
  return Response.json({ ok: true, data, total, page: filters.page, pageSize: filters.pageSize });
});
