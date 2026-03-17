import { requireAuth, errorResponse } from '../../_auth';
import { ensureMonitorSchemaIfAllowed } from '../_monitor';
import { logAudit } from '../_audit';
import { beijingDateStampCompact } from '../_time';
import { buildMonitorInventoryLogExportSql, buildMonitorInventoryLogQuery } from '../services/asset-events';

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
  if(/[\r\n,"]/g.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);
    const query = buildMonitorInventoryLogQuery(url);
    const maxRows = Math.min(100000, Math.max(1000, Number(url.searchParams.get('max') || 50000)));
    const pageSize = 1000;

    waitUntil(
      logAudit(env.DB, request, actor, 'MONITOR_INVENTORY_LOG_EXPORT', 'monitor_inventory_log', null, {
        action: query.action || null,
        issue_type: query.issue_type || null,
        keyword: (url.searchParams.get('keyword') || '').trim() || null,
        date_from: url.searchParams.get('date_from') || null,
        date_to: url.searchParams.get('date_to') || null,
      }).catch(() => {})
    );

    const sql = buildMonitorInventoryLogExportSql(query);
    const header = ['时间', '结果', '异常类型', '资产编号', 'SN', '品牌', '型号', '尺寸', '台账状态', '位置', '领用信息', '备注'].join(',');
    let csv = '\ufeff' + header + '\n';
    let exported = 0;

    for (let offset = 0; offset < maxRows; offset += pageSize) {
      const rows = (await env.DB.prepare(sql).bind(...query.binds, pageSize, offset).all<any>()).results || [];
      if (!rows.length) break;
      for (const r of rows) {
        const empInfo = r.employee_no || r.employee_name || r.department ? `${r.employee_no || '-'} / ${r.employee_name || '-'} / ${r.department || '-'}` : '-';
        const line = [
          csvEscape(r.created_at || ''),
          csvEscape(r.action === 'OK' ? '在位' : '异常'),
          csvEscape(issueTypeText(String(r.issue_type || ''))),
          csvEscape(r.asset_code || ''),
          csvEscape(r.sn || ''),
          csvEscape(r.brand || ''),
          csvEscape(r.model || ''),
          csvEscape(r.size_inch || ''),
          csvEscape(statusText(String(r.status || ''))),
          csvEscape(r.location_name || '-'),
          csvEscape(empInfo),
          csvEscape(r.remark || ''),
        ].join(',');
        csv += line + '\n';
        exported += 1;
        if (exported >= maxRows) break;
      }
      if (exported >= maxRows) break;
    }

    const filename = `monitor_inventory_log_${beijingDateStampCompact()}.csv`;
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
