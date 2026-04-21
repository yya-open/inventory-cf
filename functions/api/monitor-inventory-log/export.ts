import { errorResponse } from '../../_auth';
import { ensureMonitorSchemaIfAllowed } from '../_monitor';
import { logAudit } from '../_audit';
import { beijingDateStampCompact } from '../_time';
import { buildMonitorInventoryLogExportSql, buildMonitorInventoryLogQuery } from '../services/asset-events';
import { requireAuthWithDataScope } from '../services/data-scope';

function statusText(s: string) {
  if (s === 'IN_STOCK') return '在库';
  if (s === 'ASSIGNED') return '已领用';
  if (s === 'RECYCLED') return '已回收';
  if (s === 'SCRAPPED') return '已报废';
  return s || '-';
}

function issueTypeText(s: string) {
  if (s === 'NOT_FOUND') return '找不到显示器';
  if (s === 'WRONG_LOCATION') return '位置不符';
  if (s === 'WRONG_QR') return '二维码不符';
  if (s === 'WRONG_STATUS') return '台账状态不符';
  if (s === 'MISSING') return '设备缺失';
  if (s === 'OTHER') return '其他原因';
  return s || '-';
}

function csvEscape(v: any) {
  const s = String(v ?? '');
  if (/[\r\n,"]/g.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuthWithDataScope(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);
    const query = buildMonitorInventoryLogQuery(url, actor);
    const maxRows = Math.min(100000, Math.max(1000, Number(url.searchParams.get('max') || 50000)));
    const pageSize = 1000;

    waitUntil(
      logAudit(env.DB, request, actor, 'MONITOR_INVENTORY_LOG_EXPORT', 'monitor_inventory_log', null, {
        action: query.action || null,
        issue_type: query.issue_type || null,
        keyword: (url.searchParams.get('keyword') || '').trim() || null,
        date_from: url.searchParams.get('date_from') || null,
        date_to: url.searchParams.get('date_to') || null,
        max: maxRows,
      }).catch(() => {})
    );

    const sql = buildMonitorInventoryLogExportSql(query);
    const filename = `monitor_inventory_log_${beijingDateStampCompact()}.csv`;
    const header = ['时间', '结果', '异常类型', '资产编号', 'SN', '品牌', '型号', '尺寸', '台账状态', '位置', '领用信息', '备注'];
    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    (async () => {
      try {
        await writer.write(encoder.encode('\ufeff' + header.map(csvEscape).join(',') + '\n'));
        let written = 0;
        for (let offset = 0; written < maxRows; offset += pageSize) {
          const rows = (await env.DB.prepare(sql).bind(...query.binds, pageSize, offset).all<any>()).results || [];
          if (!rows.length) break;
          for (const r of rows) {
            const empInfo = r.employee_no || r.employee_name || r.department ? `${r.employee_no || '-'} / ${r.employee_name || '-'} / ${r.department || '-'}` : '-';
            const line = [
              r.created_at_bj || r.created_at,
              r.action === 'OK' ? '在位' : '异常',
              issueTypeText(String(r.issue_type || '')),
              r.asset_code || '',
              r.sn || '',
              r.brand || '',
              r.model || '',
              r.size_inch || '',
              statusText(String(r.status || '')),
              r.location_name || '-',
              empInfo,
              r.remark || '',
            ].map(csvEscape).join(',') + '\n';
            await writer.write(encoder.encode(line));
            written += 1;
            if (written >= maxRows) break;
          }
          if (rows.length < pageSize) break;
        }
      } catch {
      } finally {
        try { await writer.close(); } catch {}
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
