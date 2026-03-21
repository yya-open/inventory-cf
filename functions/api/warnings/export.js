import { errorResponse, json } from '../../_auth';
import { beijingDateStampCompact } from '../_time';
import { buildWarningsQuery, getWarehouseName, listWarningsExportRows } from '../services/inventory';
import { assertPartsWarehouseAccess, requireAuthWithDataScope } from '../services/data-scope';
function csvEscape(v) {
    const s = (v ?? '').toString();
    if (/[",\n\r]/.test(s))
        return '"' + s.replace(/"/g, '""') + '"';
    return s;
}
export const onRequestGet = async ({ env, request }) => {
    try {
        const user = await requireAuthWithDataScope(env, request, 'viewer');
        if (!env.DB)
            return json(false, null, '未绑定 D1 数据库(DB)');
        const query = buildWarningsQuery(new URL(request.url));
        query.warehouse_id = await assertPartsWarehouseAccess(env.DB, user, query.warehouse_id, '预警导出');
        const [results, warehouseName] = await Promise.all([
            listWarningsExportRows(env.DB, query),
            getWarehouseName(env.DB, query.warehouse_id),
        ]);
        const header = ['仓库', 'SKU', '名称', '品牌', '型号', '分类', '库存', '预警值', '缺口(预警-库存)', '最后变动时间'];
        const lines = [header.join(',')];
        for (const r of results) {
            lines.push([
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
            ].join(','));
        }
        const filename = `warnings_${beijingDateStampCompact()}.csv`;
        const csvText = '\ufeff' + lines.join('\n');
        return new Response(csvText, {
            headers: {
                'content-type': 'text/csv; charset=utf-8',
                'content-disposition': `attachment; filename="${filename}"`,
                'cache-control': 'no-store',
            },
        });
    }
    catch (e) {
        return errorResponse(e);
    }
};
