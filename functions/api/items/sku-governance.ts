import { requireAuth } from '../_auth';
import { logAudit } from '../_audit';
import { withErrorHandling } from '../_error';
import { runBatchWithGuard, GuardRollbackError } from '../_write';
import {
  normalizeSkuUpdateInput,
  scanItemSkuGovernance,
  validateGovernanceSku,
} from '../services/item-sku-governance';

type SkuUpdate = ReturnType<typeof normalizeSkuUpdateInput>;

export const onRequestGet = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  await requireAuth(env, request, 'admin');
  const url = new URL(request.url);
  const severity = url.searchParams.get('severity') || 'all';
  const limit = Number(url.searchParams.get('limit') || 500);
  const result = await scanItemSkuGovernance(env.DB, { severity, limit });
  return Response.json({ ok: true, data: result.items, summary: result.summary, limit: result.limit });
});

export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const user = await requireAuth(env, request, 'admin');
  const body = await request.json().catch(() => ({}));
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  if (!rawItems.length) return Response.json({ ok: false, message: '请选择要应用的 SKU 映射' }, { status: 400 });
  if (rawItems.length > 200) return Response.json({ ok: false, message: '单次最多处理 200 条 SKU 映射' }, { status: 400 });

  const items: SkuUpdate[] = rawItems.map(normalizeSkuUpdateInput).filter((item: SkuUpdate) => item.id > 0);
  if (!items.length) return Response.json({ ok: false, message: '没有有效的 SKU 映射' }, { status: 400 });

  const idSet = new Set<number>();
  const newSkuSet = new Set<string>();
  for (const item of items) {
    if (idSet.has(item.id)) return Response.json({ ok: false, message: `物料 ${item.id} 重复提交` }, { status: 400 });
    idSet.add(item.id);
    const validation = validateGovernanceSku(item.newSku);
    if (validation) return Response.json({ ok: false, message: validation, meta: { item } }, { status: 400 });
    if (newSkuSet.has(item.newSku)) return Response.json({ ok: false, message: `新 SKU 重复：${item.newSku}` }, { status: 400 });
    newSkuSet.add(item.newSku);
  }

  const idPlaceholders = items.map(() => '?').join(',');
  const currentRows = (await env.DB.prepare(
    `SELECT id, sku, name
       FROM items
      WHERE enabled=1 AND id IN (${idPlaceholders})`
  ).bind(...items.map((item: SkuUpdate) => item.id)).all<any>()).results || [];
  const currentById = new Map(currentRows.map((row: any) => [Number(row.id), row]));
  for (const item of items) {
    const current = currentById.get(item.id);
    if (!current) return Response.json({ ok: false, message: `物料不存在或已停用：${item.id}` }, { status: 404 });
    if (String(current.sku || '').trim() !== item.oldSku) {
      return Response.json({ ok: false, message: `物料 ${item.id} 的 SKU 已变化，请刷新后重试` }, { status: 409 });
    }
  }

  const skuPlaceholders = items.map(() => '?').join(',');
  const existing = (await env.DB.prepare(
    `SELECT id, sku
       FROM items
      WHERE enabled=1
        AND sku IN (${skuPlaceholders})
        AND id NOT IN (${idPlaceholders})`
  ).bind(...items.map((item: SkuUpdate) => item.newSku), ...items.map((item: SkuUpdate) => item.id)).all<any>()).results || [];
  if (existing.length) {
    return Response.json({
      ok: false,
      message: '部分新 SKU 已被其他物料使用',
      conflicts: existing.map((row: any) => ({ id: row.id, sku: row.sku })),
    }, { status: 409 });
  }

  const stmts: D1PreparedStatement[] = items.map((item: SkuUpdate) => env.DB.prepare(
    `UPDATE items SET sku=? WHERE id=? AND sku=? AND enabled=1`
  ).bind(item.newSku, item.id, item.oldSku));
  const guardWhere = items.map(() => '(id=? AND sku=?)').join(' OR ');
  stmts.push(env.DB.prepare(
    `SELECT CASE
       WHEN (SELECT COUNT(*) FROM items WHERE ${guardWhere}) = ?
       THEN 1
       ELSE json_extract('[]', '$[')
     END AS ok`
  ).bind(...items.flatMap((item: SkuUpdate) => [item.id, item.newSku]), items.length));

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
    changes: items.map((item: SkuUpdate) => ({
      id: item.id,
      name: currentById.get(item.id)?.name || null,
      before: item.oldSku,
      after: item.newSku,
    })),
  });

  return Response.json({ ok: true, updated: items.length });
});
