import { errorResponse, json } from '../_auth';
import { requirePermission } from '../_permissions';
import { loadOpsDashboard, repairAuditMaterialized, repairDictionaryCounters, repairPcLatestState, repairSearchNormalize, scanRepairCenter } from './services/ops-tools';
import { listAsyncJobs } from './services/async-jobs';
import { getSchemaStatus } from './services/schema-status';
import { logAudit } from './_audit';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requirePermission(env, request, 'ops_tools', 'admin');
    const [schema, dashboard, jobs, scan] = await Promise.all([
      getSchemaStatus(env.DB),
      loadOpsDashboard(env.DB),
      listAsyncJobs(env.DB, { limit: 20 }),
      scanRepairCenter(env.DB),
    ]);
    return json(true, { schema, dashboard, jobs, scan });
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const actor = await requirePermission(env, request, 'ops_tools', 'admin');
    const { action } = await request.json<any>();
    const schema = await getSchemaStatus(env.DB);
    if (!schema.ok && !['scan_all'].includes(String(action || ''))) return json(false, schema, schema.message, 409);
    let data: any = null;
    if (action === 'scan_all') data = await scanRepairCenter(env.DB);
    else if (action === 'repair_pc_latest_state') data = await repairPcLatestState(env.DB);
    else if (action === 'repair_dictionary_counters') data = await repairDictionaryCounters(env.DB);
    else if (action === 'repair_audit_materialized') data = await repairAuditMaterialized(env.DB);
    else if (action === 'repair_search_norm') data = await repairSearchNormalize(env.DB);
    else if (action === 'repair_all') {
      const preview = await scanRepairCenter(env.DB);
      const [a, b, c, d] = await Promise.all([
        repairPcLatestState(env.DB),
        repairDictionaryCounters(env.DB),
        repairAuditMaterialized(env.DB),
        repairSearchNormalize(env.DB),
      ]);
      data = { preview, repair: { pc_latest_state: a, dictionary_counters: b, audit_materialized: c, search_norm: d } };
    } else {
      return json(false, null, '不支持的操作', 400);
    }
    await logAudit(env.DB, request, actor, action === 'scan_all' ? 'ADMIN_REPAIR_SCAN' : 'ADMIN_REPAIR_RUN', 'system_tools', action, { action, result: data });
    return json(true, data);
  } catch (e: any) {
    return errorResponse(e);
  }
};
