import { errorResponse, json } from '../_auth';
import { requirePermission } from '../_permissions';
import {
  actionLabel,
  buildRepairResultSummary,
  forceRefreshRepairScan,
  getAutoRepairScan,
  listRepairHistory,
  loadOpsDashboard,
  recordRepairHistory,
  repairAuditMaterialized,
  repairDictionaryCounters,
  repairPcLatestState,
  repairSearchNormalize,
} from './services/ops-tools';
import { listAsyncJobs } from './services/async-jobs';
import { getSchemaStatus } from './services/schema-status';
import { logAudit } from './_audit';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string; BACKUP_BUCKET?: any }> = async ({ env, request }) => {
  try {
    await requirePermission(env, request, 'ops_tools', 'admin');
    const url = new URL(request.url);
    const section = String(url.searchParams.get('section') || '').trim().toLowerCase();
    if (section === 'base') {
      const [schema, dashboard, scan] = await Promise.all([
        getSchemaStatus(env.DB),
        loadOpsDashboard(env.DB),
        getAutoRepairScan(env.DB),
      ]);
      return json(true, { schema, dashboard, scan });
    }
    if (section === 'history') {
      const history = await listRepairHistory(env.DB, 20);
      return json(true, { history });
    }
    if (section === 'jobs') {
      const jobs = await listAsyncJobs(env.DB, { limit: 20, days: 7 }, env.BACKUP_BUCKET);
      return json(true, { jobs });
    }
    const [schema, dashboard, jobs, scan, history] = await Promise.all([
      getSchemaStatus(env.DB),
      loadOpsDashboard(env.DB),
      listAsyncJobs(env.DB, { limit: 20, days: 7 }, env.BACKUP_BUCKET),
      getAutoRepairScan(env.DB),
      listRepairHistory(env.DB, 20),
    ]);
    return json(true, { schema, dashboard, jobs, scan, history });
  } catch (e: any) {
    return errorResponse(e);
  }
};

async function runRepairAction(db: D1Database, action: string) {
  if (action === 'repair_pc_latest_state') return await repairPcLatestState(db);
  if (action === 'repair_dictionary_counters') return await repairDictionaryCounters(db);
  if (action === 'repair_audit_materialized') return await repairAuditMaterialized(db);
  if (action === 'repair_search_norm') return await repairSearchNormalize(db);
  throw Object.assign(new Error('不支持的操作'), { status: 400 });
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string; BACKUP_BUCKET?: any }> = async ({ env, request }) => {
  try {
    const actor = await requirePermission(env, request, 'ops_tools', 'admin');
    const { action } = await request.json<any>();
    const schema = await getSchemaStatus(env.DB);
    if (!schema.ok && !['scan_all'].includes(String(action || ''))) return json(false, schema, schema.message, 409);

    if (action === 'scan_all') {
      const data = await forceRefreshRepairScan(env.DB);
      await logAudit(env.DB, request, actor, 'ADMIN_REPAIR_SCAN', 'system_tools', action, { action, result: data });
      return json(true, data, buildRepairResultSummary(String(action || ''), data));
    }

    const before = await forceRefreshRepairScan(env.DB);
    let data: any = null;
    try {
      if (action === 'repair_all') {
        const [a, b, c, d] = await Promise.all([
          repairPcLatestState(env.DB),
          repairDictionaryCounters(env.DB),
          repairAuditMaterialized(env.DB),
          repairSearchNormalize(env.DB),
        ]);
        const after = await forceRefreshRepairScan(env.DB);
        data = { before_scan: before, repair: { pc_latest_state: a, dictionary_counters: b, audit_materialized: c, search_norm: d }, after_scan: after, after };
      } else {
        const result = await runRepairAction(env.DB, String(action || ''));
        const after = await forceRefreshRepairScan(env.DB);
        data = { ...result, before_scan: before, after_scan: after };
      }
      const summary = buildRepairResultSummary(String(action || ''), data);
      await recordRepairHistory(env.DB, {
        action: String(action || ''),
        actor_id: actor.id,
        actor_name: actor.username,
        before_scan: before,
        after_scan: data?.after_scan || data?.after || null,
        result: data,
        summary,
        success: true,
      });
      await logAudit(env.DB, request, actor, 'ADMIN_REPAIR_RUN', 'system_tools', action, { action, result: data });
      return json(true, data, summary);
    } catch (error: any) {
      const after = await forceRefreshRepairScan(env.DB).catch(() => before);
      await recordRepairHistory(env.DB, {
        action: String(action || ''),
        actor_id: actor.id,
        actor_name: actor.username,
        before_scan: before,
        after_scan: after,
        result: null,
        summary: `${actionLabel(String(action || ''))}失败`,
        success: false,
        error_text: String(error?.message || error || '执行失败'),
      });
      throw error;
    }
  } catch (e: any) {
    return errorResponse(e);
  }
};
