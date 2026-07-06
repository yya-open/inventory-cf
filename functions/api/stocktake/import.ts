import { withErrorHandling } from '../_error';
import { logAudit } from '../_audit';
import { apiFail, apiOk } from '../_response';
import { sqlNowStored } from '../_time';
import { assertPartsStocktakeAccess, requireAuthWithDataScope } from '../services/data-scope';
import { resolveItemsBySkuOrAlias } from '../services/item-sku-aliases';

export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request, waitUntil }) => {
  const user = await requireAuthWithDataScope(env, request, 'admin');
  const body: any = await request.json().catch(() => ({} as any));
  const id = Number(body.id);
  const lines = Array.isArray(body.lines) ? body.lines : [];

  if (!id) return apiFail('缺少盘点单 id', { status: 400, errorCode: 'MISSING_STOCKTAKE_ID' });
  if (!lines.length) return apiFail('没有导入明细', { status: 400, errorCode: 'EMPTY_IMPORT_LINES' });

  await assertPartsStocktakeAccess(env.DB, user, id, '库存盘点');
  const st = await env.DB.prepare(`SELECT id, status, st_no, warehouse_id FROM stocktake WHERE id=?`).bind(id).first<any>();
  if (!st) return apiFail('盘点单不存在', { status: 404, errorCode: 'STOCKTAKE_NOT_FOUND' });
  if (String(st.status) !== 'DRAFT') return apiFail('盘点单已应用，不能再导入', { status: 400, errorCode: 'STOCKTAKE_NOT_DRAFT' });

  const skus: string[] = Array.from(new Set<string>(
    lines.map((l: any) => String(l?.sku ?? '').trim()).filter((sku: string) => Boolean(sku))
  ));
  if (!skus.length) return apiFail('SKU 为空', { status: 400, errorCode: 'EMPTY_SKU' });

  const skuMatches = await resolveItemsBySkuOrAlias(env.DB, skus);

  const stmts: D1PreparedStatement[] = [];
  const unknown: string[] = [];
  const alias_matches: Array<{ input_sku: string; sku: string }> = [];

  for (const l of lines) {
    const sku = String((l as any).sku ?? '').trim();
    if (!sku) continue;
    const match = skuMatches.get(sku);
    if (!match?.id) {
      unknown.push(sku);
      continue;
    }
    const item_id = match.id;
    if (match.matched_by === 'alias') alias_matches.push({ input_sku: sku, sku: match.sku });

    const raw = (l as any).counted_qty;
    const isEmpty = raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');
    let counted: number | null = null;
    if (!isEmpty) {
      const n = Number(raw);
      if (Number.isNaN(n) || n < 0) continue;
      counted = n;
    }

    stmts.push(
      env.DB.prepare(
        `UPDATE stocktake_line
         SET counted_qty=?, diff_qty=(? - system_qty), updated_at=${sqlNowStored()}
         WHERE stocktake_id=? AND item_id=?`
      ).bind(counted, counted, id, item_id)
    );
  }

  let updated = 0;
  if (stmts.length) {
    const rs = await env.DB.batch(stmts);
    for (const r of rs as any[]) updated += Number(r?.meta?.changes || 0);
  }

  waitUntil(
    logAudit(env.DB, request, user, 'STOCKTAKE_IMPORT', 'stocktake', id, {
      st_no: st.st_no,
      updated,
      unknown: unknown.slice(0, 50),
      unknown_count: unknown.length,
    }).catch(() => {})
  );

  return apiOk({ updated, unknown, alias_matches });
});
