import { errorResponse } from '../_auth';
import { logAudit } from '../_audit';
import { sqlNowStored } from '../_time';
import { assertPartsStocktakeAccess, requireAuthWithDataScope } from '../services/data-scope';
export const onRequestPost = async ({ env, request, waitUntil }) => {
    try {
        const user = await requireAuthWithDataScope(env, request, 'admin');
        const body = await request.json().catch(() => ({}));
        const id = Number(body.id);
        const lines = Array.isArray(body.lines) ? body.lines : [];
        if (!id)
            return Response.json({ ok: false, message: '缺少盘点单 id' }, { status: 400 });
        if (!lines.length)
            return Response.json({ ok: false, message: '没有导入明细' }, { status: 400 });
        await assertPartsStocktakeAccess(env.DB, user, id, '库存盘点');
        const st = await env.DB.prepare(`SELECT id, status, st_no, warehouse_id FROM stocktake WHERE id=?`).bind(id).first();
        if (!st)
            return Response.json({ ok: false, message: '盘点单不存在' }, { status: 404 });
        if (String(st.status) !== 'DRAFT')
            return Response.json({ ok: false, message: '盘点单已应用，不能再导入' }, { status: 400 });
        const skus = Array.from(new Set(lines.map((l) => String(l?.sku ?? '').trim()).filter(Boolean)));
        if (!skus.length)
            return Response.json({ ok: false, message: 'SKU 为空' }, { status: 400 });
        const placeholders = skus.map(() => '?').join(',');
        const itemRows = (await env.DB.prepare(`SELECT id, sku FROM items WHERE sku IN (${placeholders})`).bind(...skus).all()).results || [];
        const skuToId = new Map();
        for (const r of itemRows)
            skuToId.set(r.sku, r.id);
        const stmts = [];
        const unknown = [];
        for (const l of lines) {
            const sku = String(l.sku ?? '').trim();
            if (!sku)
                continue;
            const item_id = skuToId.get(sku);
            if (!item_id) {
                unknown.push(sku);
                continue;
            }
            const raw = l.counted_qty;
            const isEmpty = raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');
            let counted = null;
            if (!isEmpty) {
                const n = Number(raw);
                if (Number.isNaN(n) || n < 0)
                    continue;
                counted = n;
            }
            stmts.push(env.DB.prepare(`UPDATE stocktake_line
           SET counted_qty=?, diff_qty=(? - system_qty), updated_at=${sqlNowStored()}
           WHERE stocktake_id=? AND item_id=?`).bind(counted, counted, id, item_id));
        }
        let updated = 0;
        if (stmts.length) {
            const rs = await env.DB.batch(stmts);
            for (const r of rs)
                updated += Number(r?.meta?.changes || 0);
        }
        waitUntil(logAudit(env.DB, request, user, 'STOCKTAKE_IMPORT', 'stocktake', id, {
            st_no: st.st_no,
            updated,
            unknown: unknown.slice(0, 50),
            unknown_count: unknown.length,
        }).catch(() => { }));
        return Response.json({ ok: true, updated, unknown });
    }
    catch (e) {
        return errorResponse(e);
    }
};
