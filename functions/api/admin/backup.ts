import { requireAuth, errorResponse } from "../../_auth";
import { logAudit } from "../_audit";
import { getAllTableSchemas, INTERNAL_SKIP_TABLES, listUserTables, sortTablesForInsert } from "./_backup_schema";

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

const __tableHasIdCache = new Map<string, boolean>();

async function tableHasId(DB: D1Database, table: string): Promise<boolean> {
  if (__tableHasIdCache.has(table)) return __tableHasIdCache.get(table)!;
  try {
    const r = await DB.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all<any>();
    const cols = (r?.results || []).map((x: any) => String(x?.name || "").trim());
    const has = cols.includes("id");
    __tableHasIdCache.set(table, has);
    return has;
  } catch {
    __tableHasIdCache.set(table, true);
    return true;
  }
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
  const hasId = await tableHasId(DB, table);
  let lastCursor = 0;
  let firstRow = true;
  const qTable = quoteIdent(table);
  const whereSql = extraWhereSql ? ` AND ${extraWhereSql}` : "";

  while (true) {
    const stmt = hasId
      ? DB.prepare(`SELECT * FROM ${qTable} WHERE id > ?${whereSql} ORDER BY id LIMIT ?`)
      : DB.prepare(`SELECT rowid as __rowid__, * FROM ${qTable} WHERE rowid > ?${whereSql} ORDER BY rowid LIMIT ?`);
    const binds = [lastCursor, ...(extraBinds || []), pageSize];
    const { results } = await stmt.bind(...binds).all<any>();
    if (!results || results.length === 0) break;

    for (const row of results) {
      if (!firstRow) controller.enqueue(encoder.encode(","));
      firstRow = false;
      if (!hasId) {
        const rid = Number((row as any)?.__rowid__ || 0);
        delete (row as any).__rowid__;
        controller.enqueue(encoder.encode(JSON.stringify(row)));
        if (rid) lastCursor = rid;
        else return;
      } else {
        controller.enqueue(encoder.encode(JSON.stringify(row)));
        if (typeof (row as any)?.id === "number") lastCursor = (row as any).id;
        else return;
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
    const includeSystem = url.searchParams.get("include_system") !== "0";
    const pageSizeRaw = Number(url.searchParams.get("page_size") || DEFAULT_PAGE_SIZE);
    const pageSize = Math.min(Math.max(pageSizeRaw || DEFAULT_PAGE_SIZE, 100), MAX_PAGE_SIZE);
    const singleTable = (url.searchParams.get("table") || "").trim();

    const tx_since = toSqlRange(url.searchParams.get("tx_since"), false);
    const tx_until = toSqlRange(url.searchParams.get("tx_until"), true);
    const audit_since = toSqlRange(url.searchParams.get("audit_since"), false);
    const audit_until = toSqlRange(url.searchParams.get("audit_until"), true);

    let tables = await listUserTables(env.DB, { includeInternal: includeSystem });
    tables = sortTablesForInsert(tables.filter((t) => !INTERNAL_SKIP_TABLES.has(t)));
    if (singleTable) {
      if (!tables.includes(singleTable)) throw new Error(`不支持导出该表：${singleTable}`);
      tables = [singleTable];
    }

    const schema = await getAllTableSchemas(env.DB, { includeInternal: includeSystem });
    const exported_at = new Date().toISOString();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(`{"version":"inventory-cf-backup-v2","exported_at":${JSON.stringify(exported_at)},"meta":{"include_system":${includeSystem ? "true" : "false"},"table_order":${JSON.stringify(tables)},"table_count":${tables.length}},"schema":${JSON.stringify(schema)},"tables":{`));
          let firstTable = true;
          for (const t of tables) {
            if (!firstTable) controller.enqueue(encoder.encode(","));
            firstTable = false;

            let extraWhere = "";
            const extraBinds: any[] = [];
            if (t === "stock_tx") {
              if (tx_since) { extraWhere += (extraWhere ? " AND " : "") + "created_at >= ?"; extraBinds.push(tx_since); }
              if (tx_until) { extraWhere += (extraWhere ? " AND " : "") + "created_at <= ?"; extraBinds.push(tx_until); }
            } else if (t === "audit_log") {
              if (audit_since) { extraWhere += (extraWhere ? " AND " : "") + "created_at >= ?"; extraBinds.push(audit_since); }
              if (audit_until) { extraWhere += (extraWhere ? " AND " : "") + "created_at <= ?"; extraBinds.push(audit_until); }
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

    waitUntil(logAudit(env.DB, request, actor, "ADMIN_BACKUP", "backup", null, {
      tables,
      exported_at,
      gzip,
      page_size: pageSize,
      include_system: includeSystem,
      version: "inventory-cf-backup-v2",
    }).catch(() => {}));

    const headers = new Headers({
      "content-type": gzip ? "application/gzip" : "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    if (download) {
      const filename = gzip ? "inventory_backup.json.gz" : "inventory_backup.json";
      headers.set("content-disposition", `attachment; filename=${filename}`);
    }

    if (!gzip) return new Response(stream, { headers });
    if (typeof (globalThis as any).CompressionStream === "undefined") {
      throw new Error("当前环境不支持 gzip 压缩");
    }
    const gz = stream.pipeThrough(new CompressionStream("gzip"));
    return new Response(gz, { headers });
  } catch (e: any) {
    return errorResponse(e);
  }
};
