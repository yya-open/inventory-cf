import { requireAuth } from '../_auth';
import { logAudit } from '../_audit';
import { withErrorHandling } from '../_error';
import { runBatchWithGuard, GuardRollbackError } from '../_write';
import { aliasInsertStatement, ensureItemSkuAliasSchema } from '../services/item-sku-aliases';
import {
  precheckSkuGovernanceUpdates,
  scanItemSkuGovernance,
  type SkuUpdateInput,
} from '../services/item-sku-governance';

export const onRequestGet = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  await requireAuth(env, request, 'admin');
  const url = new URL(request.url);
  const result = await scanItemSkuGovernance(env.DB, {
    severity: url.searchParams.get('severity') || 'all',
    issueType: url.searchParams.get('issue_type') || 'all',
    keyword: url.searchParams.get('keyword') || '',
    page: Number(url.searchParams.get('page') || 1),
    pageSize: Number(url.searchParams.get('page_size') || 50),
  });
  return Response.json({
    ok: true,
    data: result.items,
    summary: result.summary,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
});

export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const user = await requireAuth(env, request, 'admin');
  const body = await request.json().catch(() => ({}));
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  const precheck = await precheckSkuGovernanceUpdates(env.DB, rawItems);

  if (String(body?.action || '').toLowerCase() === 'precheck' || body?.preview === true) {
    return Response.json({ ok: precheck.ok, data: precheck });
  }

  if (!precheck.ok) {
    return Response.json({ ok: false, message: 'SKU 治理预检未通过', data: precheck }, { status: 409 });
  }

  await ensureItemSkuAliasSchema(env.DB);
  const items = precheck.items as Array<SkuUpdateInput & { name?: string | null; aliasAlreadyActive?: boolean }>;
  const stmts: D1PreparedStatement[] = [];
  for (const item of items) {
    stmts.push(env.DB.prepare(
      `UPDATE items SET sku=? WHERE id=? AND sku=? AND enabled=1`
    ).bind(item.newSku, item.id, item.oldSku));
    if (item.oldSku && item.oldSku !== item.newSku && !item.aliasAlreadyActive) {
      stmts.push(aliasInsertStatement(env.DB, {
        item_id: item.id,
        alias_sku: item.oldSku,
        created_by: user.username || null,
        note: 'SKU治理自动保留旧SKU',
      }));
    }
  }

  const aliasGuardItems = items.filter((item) => item.oldSku && item.oldSku !== item.newSku);
  if (aliasGuardItems.length) {
    const aliasGuardWhere = aliasGuardItems.map(() => '(item_id=? AND alias_sku=? AND active=1)').join(' OR ');
    stmts.push(env.DB.prepare(
      `SELECT CASE
         WHEN (SELECT COUNT(*) FROM item_sku_aliases WHERE ${aliasGuardWhere}) = ?
         THEN 1
         ELSE json_extract('[]', '$[')
       END AS ok`
    ).bind(...aliasGuardItems.flatMap((item) => [item.id, item.oldSku]), aliasGuardItems.length));
  }

  const guardWhere = items.map(() => '(id=? AND sku=?)').join(' OR ');
  stmts.push(env.DB.prepare(
    `SELECT CASE
       WHEN (SELECT COUNT(*) FROM items WHERE ${guardWhere}) = ?
       THEN 1
       ELSE json_extract('[]', '$[')
     END AS ok`
  ).bind(...items.flatMap((item) => [item.id, item.newSku]), items.length));

  try {
    await runBatchWithGuard(env.DB, stmts);
  } catch (e) {
    if (e instanceof GuardRollbackError) {
      return Response.json({ ok: false, message: 'SKU 治理应用失败，数据已变化，请刷新后重试' }, { status: 409 });
    }
    throw e;
  }

  await logAudit(env.DB, request, user, 'ITEM_SKU_GOVERNANCE_APPLY', 'items', null, {
    count: items.length,
    alias_count: precheck.alias_to_create_count,
    manually_changed_count: precheck.manually_changed_count,
    changes: items.map((item) => ({
      id: item.id,
      name: item.name || null,
      before: item.oldSku,
      after: item.newSku,
      alias_created: item.oldSku && item.oldSku !== item.newSku ? item.oldSku : null,
    })),
  });

  return Response.json({ ok: true, updated: items.length, alias_created: precheck.alias_to_create_count });
});
