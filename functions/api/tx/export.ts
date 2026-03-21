import { errorResponse } from '../../_auth';
import { logAudit } from '../_audit';
import { beijingDateStampCompact } from '../_time';
import { buildTxExportSql, buildTxListQuery } from '../services/inventory';
import { assertPartsWarehouseAccess, requireAuthWithDataScope } from '../services/data-scope';

/**
 * GET /api/tx/export
 * Export stock_tx as CSV (UTF-8 with BOM) generated on the backend.
 * Designed for large exports: reads rows page-by-page and streams CSV.
 */
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuthWithDataScope(env, request, 'viewer');
    const url = new URL(request.url);
    const maxRows = Math.min(100000, Math.max(1000, Number(url.searchParams.get('max') || 50000)));
    const pageSize = 1000;
    url.searchParams.set('warehouse_id', String(await assertPartsWarehouseAccess(env.DB, actor, Number(url.searchParams.get('warehouse_id') || 1), '出入库明细导出')));
    const query = buildTxListQuery(url);

    waitUntil(
      logAudit(env.DB, request, actor, 'TX_EXPORT', 'stock_tx', null, {
        type: query.type || null,
        item_id: query.item_id,
        warehouse_id: query.warehouse_id,
        keyword: (url.searchParams.get('keyword') || '').trim() || null,
        date_from: url.searchParams.get('date_from') || null,
        date_to: url.searchParams.get('date_to') || null,
        max: maxRows,
      }).catch(() => {})
    );

    const sql = buildTxExportSql(query);

    const toCsvCell = (v: any) => {
      const s = String(v ?? '');
      return `"${s.replace(/"/g, '""')}"`;
    };

    const filename = `stock_tx_${beijingDateStampCompact()}.csv`;
    const header = ['时间', '单号', '类型', 'SKU', '名称', '仓库', '数量', '变动', '来源', '去向', '备注'];

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    (async () => {
      try {
        await writer.write(new TextEncoder().encode('\ufeff' + header.map(toCsvCell).join(',') + '\n'));
        let written = 0;
        let lastId = Number.MAX_SAFE_INTEGER;

        while (written < maxRows) {
          const binds = [...query.bindsBase, lastId, pageSize];
          const { results } = await env.DB.prepare(sql).bind(...binds).all<any>();
          const rows = (results || []) as any[];
          if (!rows.length) break;

          for (const r of rows) {
            const line = [
              r.created_at_bj || r.created_at,
              r.tx_no,
              r.type,
              r.sku,
              r.name,
              r.warehouse_name,
              r.qty,
              typeof r.delta_qty === 'number' ? r.delta_qty : 0,
              r.source || '',
              r.target || '',
              r.remark || '',
            ].map(toCsvCell).join(',') + '\n';
            await writer.write(new TextEncoder().encode(line));
            written += 1;
            if (written >= maxRows) break;
          }

          lastId = Number(rows[rows.length - 1]?.id || 0);
          if (!lastId || rows.length < pageSize) break;
        }
      } catch {
        // ignore streaming errors
      } finally {
        try {
          await writer.close();
        } catch {}
      }
    })();

    return new Response(readable, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
