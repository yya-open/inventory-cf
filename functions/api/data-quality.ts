import { json } from '../_auth';
import { withErrorHandling } from './_error';
import { requirePermission } from '../_permissions';
import { logAudit } from './_audit';
import { listDataQualityCases, scanDataQualityCases, updateDataQualityCase } from './services/data-quality-cases';

type Env = { DB: D1Database; JWT_SECRET: string };

export const onRequestGet = withErrorHandling<Env>(async ({ env, request }) => {
  await requirePermission(env, request, 'ops_tools', 'viewer');
  const url = new URL(request.url);
  const data = await listDataQualityCases(env.DB, { status: url.searchParams.get('status') || '', limit: Number(url.searchParams.get('limit') || 100) });
  return json(true, data);
});

export const onRequestPost = withErrorHandling<Env>(async ({ env, request }) => {
  const actor = await requirePermission(env, request, 'ops_tools', 'viewer');
  const data = await scanDataQualityCases(env.DB);
  await logAudit(env.DB, request, actor, 'DATA_QUALITY_SCAN', 'data_quality_cases', 'scan', { issue_count: data.issue_count });
  return json(true, data);
});

export const onRequestPut = withErrorHandling<Env>(async ({ env, request }) => {
  const actor = await requirePermission(env, request, 'ops_tools', 'viewer');
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id || 0);
  if (!Number.isFinite(id) || id <= 0) throw Object.assign(new Error('Missing case id'), { status: 400 });
  const row = await updateDataQualityCase(env.DB, id, body || {});
  await logAudit(env.DB, request, actor, 'DATA_QUALITY_CASE_UPDATE', 'data_quality_cases', id, { status: row?.status, owner: row?.owner, due_at: row?.due_at });
  return json(true, row);
});
