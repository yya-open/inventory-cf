import { requireAuth, errorResponse } from "../../_auth";
import { logAudit } from "../_audit";
import { getAllTableSchemas, getKnownTables, INTERNAL_SKIP_TABLES } from "./_backup_schema";

const DEFAULT_PAGE_SIZE = 1000;
const MAX_PAGE_SIZE = 5000;

function quoteIdent(name: string) {
  return `"${String(name || "").replace(/"/g, '""')}"`;
}

function toSqlRange(dateStr?: string | null, endOfDay?: boolean) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return endOfDay ? `${s} 23:59:59` : `${s} 00:00:00`;
  }
  return s;
}

function tableHasId(table: string) {
  const schema = getAllTableSchemas()[table];
  return !!schema?.columns?.some((c) => c.name === 'id');
}

async function streamTableAsJsonArray(
  DB: D1Database,
  table: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  pageSize: number,
  extraWhereSql: string,
  extraBinds: any[]
) {
  const hasId = tableHasId(table);
  let lastCursor = 0;
  let firstRow = true;
  const qTable = quoteIdent(table);
  const whereSql = extraWhereSql ? ` AND ${extraWhereSql}` : "";

  while (true) {
    const stmt = hasId
      ? DB.prepare(`SELECT * FROM ${qTable} WHERE id > ?${whereSql} ORDER BY id LIMIT ?`)
      : DB.prepare(`SELECT rowid as __rowid__, * FROM ${qTable} WHERE rowid > ?${whereSql} ORDER BY rowid LIMIT ?`);
    const binds = [lastCursor, ...(extraBinds || []), pageSize];
    let results: any[] = [];
    try {
      const r = await stmt.bind(...binds).all<any>();
      results = r?.results || [];
    } catch {
      break;
    }
    if (!results.length) break;
    for (const row of results) {
      if (!firstRow) controller.enqueue(encoder.encode(","));
      firstRow = false;
      if (!hasId) {
        const rid = Number((row as any)?.__rowid__ || 0);
        delete (row as any).__rowid__;
        controller.enqueue(encoder.encode(JSON.stringify(row)));
        if (rid) lastCursor = rid; else return;
      } else {
        controller.enqueue(encoder.encode(JSON.stringify(row)));
        if (typeof (row as any)?.id === 'number') lastCursor = (row as any).id; else return;
      }
    }
  }
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    const url = new URL(request.url);
    const download = url.searchParams.get("download") === "1";
    const gzip = url.searchParams.get("gzip") === "1";
    const pageSizeRaw = Number(url.searchParams.get("page_size") || DEFAULT_PAGE_SIZE);
    const pageSize = Math.min(Math.max(pageSizeRaw || DEFAULT_PAGE_SIZE, 100), MAX_PAGE_SIZE);
    const singleTable = (url.searchParams.get("table") || "").trim();

    const tx_since = toSqlRange(url.searchParams.get("tx_since"), false);
    const tx_until = toSqlRange(url.searchParams.get("tx_until"), true);
    const audit_since = toSqlRange(url.searchParams.get("audit_since"), false);
    const audit_until = toSqlRange(url.searchParams.get("audit_until"), true);

    let tables = getKnownTables().filter((t) => !INTERNAL_SKIP_TABLES.has(t));
    if (singleTable) {
      if (!tables.includes(singleTable)) throw new Error(`不支持导出该表：${singleTable}`);
      tables = [singleTable];
    }

    const schema = getAllTableSchemas();
    const exported_at = new Date().toISOString();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(`{"version":"inventory-cf-backup-v2","exported_at":${JSON.stringify(exported_at)},"meta":{"table_order":${JSON.stringify(tables)},"table_count":${tables.length}},"schema":${JSON.stringify(schema)},"tables":{`));
          let firstTable = true;
          for (const t of tables) {
            if (!firstTable) controller.enqueue(encoder.encode(","));
            firstTable = false;
            let extraWhere = "";
            const extraBinds: any[] = [];
            if (t === 'stock_tx') {
              if (tx_since) { extraWhere += (extraWhere ? ' AND ' : '') + 'created_at >= ?'; extraBinds.push(tx_since); }
              if (tx_until) { extraWhere += (extraWhere ? ' AND ' : '') + 'created_at <= ?'; extraBinds.push(tx_until); }
            } else if (t === 'audit_log') {
              if (audit_since) { extraWhere += (extraWhere ? ' AND ' : '') + 'created_at >= ?'; extraBinds.push(audit_since); }
              if (audit_until) { extraWhere += (extraWhere ? ' AND ' : '') + 'created_at <= ?'; extraBinds.push(audit_until); }
            }
            controller.enqueue(encoder.encode(`${JSON.stringify(t)}:[`));
            await streamTableAsJsonArray(env.DB, t, controller, encoder, pageSize, extraWhere, extraBinds);
            controller.enqueue(encoder.encode(`]`));
          }
          controller.enqueue(encoder.encode(`}}`));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    waitUntil(logAudit(env.DB, request, actor, "ADMIN_BACKUP", "backup", null, { tables, exported_at, gzip, page_size: pageSize, version: "inventory-cf-backup-v2" }).catch(() => {}));

    const headers = new Headers({ "content-type": gzip ? "application/gzip" : "application/json; charset=utf-8", "cache-control": "no-store" });
    if (download) headers.set("content-disposition", `attachment; filename=${gzip ? 'inventory_backup.json.gz' : 'inventory_backup.json'}`);
    if (!gzip) return new Response(stream, { headers });
    if (typeof (globalThis as any).CompressionStream === "undefined") throw new Error("当前环境不支持 gzip 压缩");
    return new Response(stream.pipeThrough(new CompressionStream("gzip")), { headers });
  } catch (e: any) {
    return errorResponse(e);
  }
};
