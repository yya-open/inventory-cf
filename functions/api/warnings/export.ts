import { json } from '../../_auth';
import { withErrorHandling } from '../_error';
import { beijingDateStampCompact } from '../_time';
import { buildWarningsQuery, getWarehouseName, listWarningsExportRows } from '../services/inventory';
import { assertPartsWarehouseAccess, requireAuthWithDataScope } from '../services/data-scope';

function csvEscape(v: any) {
  const s = (v ?? '').toString();
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export const onRequestGet = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const user = await requireAuthWithDataScope(env, request, 'viewer');
  if (!env.DB) return json(false, null, '未绑定 D1 数据库(DB)');

  const url = new URL(request.url);
  const query = buildWarningsQuery(url);
  query.warehouse_id = await assertPartsWarehouseAccess(env.DB, user, query.warehouse_id, '预警导出');
  const warehouseName = await getWarehouseName(env.DB, query.warehouse_id);

  const maxRows = Math.min(100000, Math.max(1000, Number(url.searchParams.get('max') || 50000)));
  const pageSize = 1000;

  const header = ['仓库', 'SKU', '名称', '品牌', '型号', '分类', '库存', '预警值', '缺口(预警-库存)', '最后变动时间'];
  const encoder = new TextEncoder();
  let written = 0;
  let offset = 0;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('\ufeff' + header.join(',') + '\n'));
    },
    async pull(controller) {
      if (written >= maxRows) return controller.close();
      const limit = Math.min(pageSize, maxRows - written);
      const rows = await listWarningsExportRows(env.DB!, query, { limit, offset }) as any[];
      if (!rows.length) return controller.close();
      for (const r of rows) {
        const line = [
          csvEscape(warehouseName),
          csvEscape(r.sku),
          csvEscape(r.name),
          csvEscape(r.brand),
          csvEscape(r.model),
          csvEscape(r.category),
          csvEscape(r.qty),
          csvEscape(r.warning_qty),
          csvEscape(r.gap),
          csvEscape(r.last_tx_at_bj || r.last_tx_at),
        ].join(',');
        controller.enqueue(encoder.encode(line + '\n'));
        written += 1;
      }
      offset += rows.length;
      if (rows.length < limit) controller.close();
    },
  });

  const filename = `warnings_${beijingDateStampCompact()}.csv`;
  return new Response(stream, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
});
