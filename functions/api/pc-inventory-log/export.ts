import { errorResponse } from '../../_auth';
import { ensurePcSchemaIfAllowed } from '../_pc';
import { logAudit } from '../_audit';
import { beijingDateStampCompact } from '../_time';
import { buildPcInventoryLogExportSql, buildPcInventoryLogQuery } from '../services/asset-events';
import { requireAuthWithDataScope } from '../services/data-scope';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuthWithDataScope(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    const t = (env as any).__timing;
    if (t?.measure) await t.measure('schema', () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    const query = buildPcInventoryLogQuery(url, actor);
    const maxRows = Math.min(100000, Math.max(1000, Number(url.searchParams.get('max') || 50000)));
    const pageSize = 1000;

    waitUntil(
      logAudit(env.DB, request, actor, 'PC_INVENTORY_LOG_EXPORT', 'pc_inventory_log', null, {
        action: query.action || null,
        issue_type: query.issue_type || null,
        keyword: (url.searchParams.get('keyword') || '').trim() || null,
        date_from: url.searchParams.get('date_from') || null,
        date_to: url.searchParams.get('date_to') || null,
        max: maxRows,
      }).catch(() => {})
    );

    const sql = buildPcInventoryLogExportSql(query);
    const toCsvCell = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const filename = `pc_inventory_log_${beijingDateStampCompact()}.csv`;
    const statusText = (s: any) => {
      const v = String(s || '');
      if (v === 'IN_STOCK') return '在库';
      if (v === 'ASSIGNED') return '已领用';
      if (v === 'RECYCLED') return '已回收';
      if (v === 'SCRAPPED') return '已报废';
      return v || '-';
    };
    const issueTypeText = (s: any) => {
      const v = String(s || '');
      if (v === 'NOT_FOUND') return '找不到电脑';
      if (v === 'WRONG_LOCATION') return '位置不符';
      if (v === 'WRONG_QR') return '二维码不符';
      if (v === 'WRONG_STATUS') return '台账状态不符';
      if (v === 'MISSING') return '设备缺失';
      if (v === 'OTHER') return '其他原因';
      return v || '-';
    };
    const header = ['时间', '结果', '异常类型', 'SN', '品牌', '型号', '台账状态', '员工工号', '员工姓名', '部门', '备注'];
    const encoder = new TextEncoder();
    let lastId = Number.MAX_SAFE_INTEGER;

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    (async () => {
      try {
        await writer.write(encoder.encode('\ufeff' + header.map(toCsvCell).join(',') + '\n'));
        let written = 0;
        while (written < maxRows) {
          const rows = (await env.DB.prepare(sql).bind(...query.binds, lastId, pageSize).all<any>()).results || [];
          if (!rows.length) break;
          for (const r of rows) {
            const line = [
              r.created_at_bj || r.created_at,
              r.action === 'OK' ? '在位' : '异常',
              issueTypeText(r.issue_type),
              r.serial_no,
              r.brand,
              r.model,
              statusText(r.status),
              r.employee_no || '',
              r.employee_name || '',
              r.department || '',
              r.remark || '',
            ].map(toCsvCell).join(',') + '\n';
            await writer.write(encoder.encode(line));
            written += 1;
            if (written >= maxRows) break;
          }
          lastId = Number(rows[rows.length - 1].id);
          if (!lastId || rows.length < pageSize) break;
        }
      } catch {
      } finally {
        try { await writer.close(); } catch {}
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
