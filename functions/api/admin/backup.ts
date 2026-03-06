import { requireAuth, errorResponse } from '../../_auth';
import { logAudit } from '../_audit';
import { ensureCoreSchema } from '../_schema';
import { ensurePcSchema } from '../_pc';
import { ensureMonitorSchema } from '../_monitor';
import { BACKUP_TABLE_MAP, EXPORTABLE_TABLES } from './_backup_schema';

type ExtraFilter = { whereSql: string; binds: any[] };

const DEFAULT_PAGE_SIZE = 1000;
const MAX_PAGE_SIZE = 5000;

function toSqlRange(dateStr?: string | null, endOfDay?: boolean) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return endOfDay ? `${s} 23:59:59` : `${s} 00:00:00`;
  return s;
}

function buildExtraFilter(table: string, url: URL): ExtraFilter {
  const wh: string[] = [];
  const binds: any[] = [];

  if (table === 'stock_tx') {
    const since = toSqlRange(url.searchParams.get('tx_since'), false);
    const until = toSqlRange(url.searchParams.get('tx_until'), true);
    if (since) { wh.push('created_at >= ?'); binds.push(since); }
    if (until) { wh.push('created_at <= ?'); binds.push(until); }
  } else if (table === 'audit_log') {
    const since = toSqlRange(url.searchParams.get('audit_since'), false);
    const until = toSqlRange(url.searchParams.get('audit_until'), true);
    if (since) { wh.push('created_at >= ?'); binds.push(since); }
    if (until) { wh.push('created_at <= ?'); binds.push(until); }
  } else if (table === 'api_slow_requests') {
    const since = toSqlRange(url.searchParams.get('slow_since'), false);
    const until = toSqlRange(url.searchParams.get('slow_until'), true);
    if (since) { wh.push('created_at >= ?'); binds.push(since); }
    if (until) { wh.push('created_at <= ?'); binds.push(until); }
  }

  return { whereSql: wh.length ? `WHERE ${wh.join(' AND ')}` : '', binds };
}

async function countTableRows(DB: D1Database, table: string, extra: ExtraFilter) {
  const row = await DB.prepare(`SELECT COUNT(*) AS c FROM ${table} ${extra.whereSql}`).bind(...extra.binds).first<any>();
  return Number(row?.c || 0);
}

async function streamTableAsJsonArray(
  DB: D1Database,
  table: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  pageSize: number,
  extra: ExtraFilter,
) {
  const meta = BACKUP_TABLE_MAP[table];
  const pk = meta?.primaryKey || 'id';
  const numericPk = pk === 'id';
  let firstRow = true;
  let offset = 0;
  let lastPk: any = null;

  while (true) {
    let sql = '';
    let binds: any[] = [];
    if (numericPk) {
      sql = `SELECT * FROM ${table} ${extra.whereSql ? `${extra.whereSql} AND ${pk} > ?` : `WHERE ${pk} > ?`} ORDER BY ${pk} LIMIT ?`;
      binds = [...extra.binds, Number(lastPk || 0), pageSize];
    } else {
      sql = `SELECT * FROM ${table} ${extra.whereSql} ORDER BY ${pk} LIMIT ? OFFSET ?`;
      binds = [...extra.binds, pageSize, offset];
    }

    const { results } = await DB.prepare(sql).bind(...binds).all<any>();
    if (!results?.length) break;

    for (const row of results) {
      if (!firstRow) controller.enqueue(encoder.encode(','));
      firstRow = false;
      controller.enqueue(encoder.encode(JSON.stringify(row)));
      if (numericPk) lastPk = row?.[pk];
    }

    if (numericPk && (lastPk === null || lastPk === undefined)) break;
    if (!numericPk) offset += results.length;
    if (results.length < pageSize) break;
  }
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, 'admin');
    await ensureCoreSchema(env.DB);
    await ensurePcSchema(env.DB);
    await ensureMonitorSchema(env.DB);

    const url = new URL(request.url);
    const download = url.searchParams.get('download') === '1';
    const gzip = url.searchParams.get('gzip') === '1';
    const pageSizeRaw = Number(url.searchParams.get('page_size') || DEFAULT_PAGE_SIZE);
    const pageSize = Math.min(Math.max(pageSizeRaw || DEFAULT_PAGE_SIZE, 100), MAX_PAGE_SIZE);

    const singleTable = (url.searchParams.get('table') || '').trim();
    const requestedSystem = url.searchParams.get('include_system') !== '0';

    let tables = EXPORTABLE_TABLES.filter((t) => requestedSystem || !BACKUP_TABLE_MAP[t]?.system);
    if (singleTable) {
      if (!BACKUP_TABLE_MAP[singleTable] || BACKUP_TABLE_MAP[singleTable]?.exportable === false) {
        throw new Error(`不支持导出该表：${singleTable}`);
      }
      tables = [singleTable];
    }

    const exported_at = new Date().toISOString();
    const encoder = new TextEncoder();
    const summary: Record<string, number> = {};
    for (const t of tables) summary[t] = await countTableRows(env.DB, t, buildExtraFilter(t, url));

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(JSON.stringify({
            version: 'inventory-cf-backup-v2',
            exported_at,
            meta: {
              app: 'inventory-cf',
              mode: 'full',
              include_system: requestedSystem,
              table_count: tables.length,
              table_rows: summary,
            },
          }).replace(/}\s*$/, ',"tables":{')));

          let firstTable = true;
          for (const table of tables) {
            if (!firstTable) controller.enqueue(encoder.encode(','));
            firstTable = false;
            controller.enqueue(encoder.encode(`${JSON.stringify(table)}:[`));
            await streamTableAsJsonArray(env.DB, table, controller, encoder, pageSize, buildExtraFilter(table, url));
            controller.enqueue(encoder.encode(']'));
          }

          controller.enqueue(encoder.encode('}}'));
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });

    let body: ReadableStream<Uint8Array> = stream;
    const headers = new Headers();
    const filename = `inventory-backup-${exported_at.replace(/[:.]/g, '-')}.json${gzip ? '.gz' : ''}`;
    headers.set('Content-Type', gzip ? 'application/gzip' : 'application/json; charset=utf-8');
    if (download) headers.set('Content-Disposition', `attachment; filename="${filename}"`);

    if (gzip) {
      if (typeof (globalThis as any).CompressionStream === 'undefined') {
        throw new Error('当前环境不支持 gzip 压缩');
      }
      body = stream.pipeThrough(new CompressionStream('gzip'));
    }

    waitUntil(logAudit(env.DB, request, actor, 'ADMIN_BACKUP', 'backup', null, {
      tables,
      exported_at,
      gzip,
      page_size: pageSize,
      summary,
    }).catch(() => {}));

    return new Response(body, { headers });
  } catch (e: any) {
    return errorResponse(e);
  }
};
