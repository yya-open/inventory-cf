import { errorResponse } from '../_auth';
import { buildTxListQuery, countTxRows, listTxRows } from './services/inventory';
import { assertPartsWarehouseAccess, requireAuthWithDataScope } from './services/data-scope';
export const onRequestGet = async ({ env, request }) => {
    try {
        const user = await requireAuthWithDataScope(env, request, 'viewer');
        const url = new URL(request.url);
        url.searchParams.set('warehouse_id', String(await assertPartsWarehouseAccess(env.DB, user, Number(url.searchParams.get('warehouse_id') || 1), '出入库明细')));
        const query = buildTxListQuery(url);
        const [total, rows] = await Promise.all([
            countTxRows(env.DB, query),
            listTxRows(env.DB, query),
        ]);
        return Response.json({
            ok: true,
            data: rows,
            total,
            page: query.page,
            pageSize: query.pageSize,
            sort_by: query.sort_by,
            sort_dir: query.sort_dir,
            keyword_mode: query.keyword_mode,
        });
    }
    catch (e) {
        return errorResponse(e);
    }
};
