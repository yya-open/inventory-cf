import { errorResponse } from '../../_auth';
import { ensureMonitorSchemaIfAllowed } from '../_monitor';
import { logAudit } from '../_audit';
import { beijingDateStampCompact } from '../_time';
import { buildMonitorTxExportSql, buildMonitorTxQuery } from '../services/asset-events';
import { requireAuthWithDataScope } from '../services/data-scope';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuthWithDataScope(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const query = buildMonitorTxQuery(url, actor);
    const date_from = url.searchParams.get('date_from') || url.searchParams.get('start') || url.searchParams.get('date_start');
    const date_to = url.searchParams.get('date_to') || url.searchParams.get('end') || url.searchParams.get('date_end');
    const maxRows = Math.min(100000, Math.max(1000, Number(url.searchParams.get('max') || 50000)));
    const pageSize = 1000;

    waitUntil(
      logAudit(env.DB, request, actor, 'MONITOR_TX_EXPORT', 'monitor_tx', null, {
        type: query.type || null,
        keyword: (url.searchParams.get('keyword') || '').trim() || null,
        date_from: date_from || null,
        date_to: date_to || null,
        max: maxRows,
      }).catch(() => {})
    );

    const sql = buildMonitorTxExportSql(query);
    const toCsvCell = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const typeText = (v: any) => {
      const x = String(v || '');
      if (x === 'IN') return '入库';
      if (x === 'OUT') return '出库';
      if (x === 'RETURN') return '归还';
      if (x === 'TRANSFER') return '调拨';
      if (x === 'SCRAP') return '报废';
      if (x === 'ADJUST') return '调整';
      return x || '-';
    };

    const filename = `monitor_tx_${beijingDateStampCompact()}.csv`;
    const header = ['记录ID', '时间', '北京时间', '流水号', '动作', '资产编号', 'SN', '品牌', '型号', '尺寸', '工号', '姓名', '部门', '来源位置', '目标位置', '备注', '操作人'];
    const encoder = new TextEncoder();
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    let rowCount = 0;
    let lastId = Number.MAX_SAFE_INTEGER;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bom);
        controller.enqueue(encoder.encode(header.map(toCsvCell).join(',') + '\n'));
      },
      async pull(controller) {
        if (rowCount >= maxRows) return controller.close();
        const rows = (await env.DB!.prepare(sql).bind(...query.binds, lastId, pageSize).all<any>()).results || [];
        if (!rows.length) return controller.close();

        for (const it of rows) {
          lastId = Number(it.id || lastId);
          rowCount += 1;
          const fromLoc = [it.from_parent_location, it.from_location].filter(Boolean).join('/') || '';
          const toLoc = [it.to_parent_location, it.to_location].filter(Boolean).join('/') || '';
          const line = [
            it.id,
            it.created_at,
            it.created_at_bj,
            it.tx_no,
            typeText(it.tx_type),
            it.asset_code,
            it.sn,
            it.brand,
            it.model,
            it.size_inch,
            it.employee_no,
            it.employee_name,
            it.department,
            fromLoc,
            toLoc,
            it.remark,
            it.created_by,
          ].map(toCsvCell).join(',');
          controller.enqueue(encoder.encode(line + '\n'));
          if (rowCount >= maxRows) break;
        }
      },
    });

    return new Response(stream, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
