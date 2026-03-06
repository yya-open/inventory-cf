import { requireAuth, errorResponse } from "../../_auth";
import { logAudit } from "../_audit";
import { listBackupTables } from "./_backup_schema";

type BackupPayload = {
  version: string;
  exported_at: string;
  tables: Record<string, any[]>;
};

const DEFAULT_PAGE_SIZE = 1000;
const MAX_PAGE_SIZE = 5000;

async function tableExists(DB: D1Database, table: string): Promise<boolean> {
  try {
    const r = await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(table).first<any>();
    return !!r;
  } catch {
    return true;
  }
}

function toSqlRange(dateStr?: string | null, endOfDay?: boolean) {
  if (!dateStr) return null;
  // Accept YYYY-MM-DD or ISO-like strings; we normalize YYYY-MM-DD to sqlite datetime format.
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
    const r = await DB.prepare(`PRAGMA table_info(${table})`).all<any>();
    const cols = (r?.results || []).map((x: any) => String(x?.name || '').trim());
    const has = cols.includes('id');
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
  // Prefer paginating by numeric `id` when present.
  // Some auxiliary tables (e.g. public_api_throttle) do NOT have `id`, so we fallback to rowid.
  const hasId = await tableHasId(DB, table);
  let lastCursor = 0;
  let firstRow = true;

  const whereSql = extraWhereSql ? ` AND ${extraWhereSql}` : "";

  while (true) {
    const stmt = hasId
      ? DB.prepare(`SELECT * FROM ${table} WHERE id > ?${whereSql} ORDER BY id LIMIT ?`)
      : DB.prepare(`SELECT rowid as __rowid__, * FROM ${table} WHERE rowid > ?${whereSql} ORDER BY rowid LIMIT ?`);
    const binds = [lastCursor, ...(extraBinds || []), pageSize];

    const { results } = await stmt.bind(...binds).all<any>();
    if (!results || results.length === 0) break;

    for (const row of results) {
      if (!firstRow) controller.enqueue(encoder.encode(","));
      firstRow = false;

      if (!hasId) {
        // Strip rowid helper field from export payload.
        const rid = Number((row as any)?.__rowid__ || 0);
        delete (row as any).__rowid__;
        controller.enqueue(encoder.encode(JSON.stringify(row)));
        if (rid) lastCursor = rid;
        else return;
      } else {
        controller.enqueue(encoder.encode(JSON.stringify(row)));
        // Advance cursor. If `id` is missing for any reason, stop paginating to avoid an infinite loop.
        if (typeof (row as any)?.id === "number") lastCursor = (row as any).id;
        else return;
      }
    }
  }
}

// GET /api/admin/backup
// Admin-only. Export selected tables as JSON.
// Query:
//  - include_tx=1, include_audit=1, include_stocktake=1, include_throttle=1
//  - download=1 (forces attachment)
//  - gzip=1 (stream gzip compression)
//  - page_size=1000 (pagination size, 100..5000)
//  - table=stock_tx (export a single table; overrides include_*)
//  - tx_since=YYYY-MM-DD, tx_until=YYYY-MM-DD (filter stock_tx by created_at)
//  - audit_since=YYYY-MM-DD, audit_until=YYYY-MM-DD (filter audit_log by created_at)
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    const url = new URL(request.url);

    const include_tx = url.searchParams.get("include_tx") === "1";
    const include_audit = url.searchParams.get("include_audit") === "1";
    const include_stocktake = url.searchParams.get("include_stocktake") === "1";
    const include_throttle = url.searchParams.get("include_throttle") === "1";
    const download = url.searchParams.get("download") === "1";

    const gzip = url.searchParams.get("gzip") === "1";
    const pageSizeRaw = Number(url.searchParams.get("page_size") || DEFAULT_PAGE_SIZE);
    const pageSize = Math.min(Math.max(pageSizeRaw || DEFAULT_PAGE_SIZE, 100), MAX_PAGE_SIZE);

    const singleTable = (url.searchParams.get("table") || "").trim();

    // 兼容旧参数：现在默认导出所有业务表，include_* 仅保留为兼容开关，不再缩小“完整备份”的范围。
    const allTables = await listBackupTables(env.DB);
    const allowTables = new Set(allTables);
    let tables: string[] = allTables;

    if (singleTable) {
      if (!allowTables.has(singleTable)) {
        throw new Error(`不支持导出该表：${singleTable}`);
      }
      tables = [singleTable];
    }

    const tx_since = toSqlRange(url.searchParams.get("tx_since"), false);
    const tx_until = toSqlRange(url.searchParams.get("tx_until"), true);
    const audit_since = toSqlRange(url.searchParams.get("audit_since"), false);
    const audit_until = toSqlRange(url.searchParams.get("audit_until"), true);

    const exported_at = new Date().toISOString();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            encoder.encode(
              `{"version":"inventory-cf-backup-v1","exported_at":${JSON.stringify(exported_at)},"tables":{`
            )
          );

          let firstTable = true;
          for (const t of tables) {
            if (!firstTable) controller.enqueue(encoder.encode(","));
            firstTable = false;

            let extraWhere = "";
            const extraBinds: any[] = [];

            if (t === "stock_tx") {
              if (tx_since) {
                extraWhere += (extraWhere ? " AND " : "") + "created_at >= ?";
                extraBinds.push(tx_since);
              }
              if (tx_until) {
                extraWhere += (extraWhere ? " AND " : "") + "created_at <= ?";
                extraBinds.push(tx_until);
              }
            } else if (t === "audit_log") {
              if (audit_since) {
                extraWhere += (extraWhere ? " AND " : "") + "created_at >= ?";
                extraBinds.push(audit_since);
              }
              if (audit_until) {
                extraWhere += (extraWhere ? " AND " : "") + "created_at <= ?";
                extraBinds.push(audit_until);
              }
            }

            controller.enqueue(encoder.encode(`${JSON.stringify(t)}:[`));
            if (await tableExists(env.DB, t)) {
              await streamTableAsJsonArray(env.DB, t, controller, encoder, pageSize, extraWhere, extraBinds);
            }
            controller.enqueue(encoder.encode(`]`));
          }

          controller.enqueue(encoder.encode(`}}`));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    // Best-effort audit (don't block backup)
    waitUntil(logAudit(env.DB, request, actor, "ADMIN_BACKUP", "backup", null, {
      tables,
      exported_at,
      gzip,
      page_size: pageSize,
      table: singleTable || undefined,
      tx_since: tx_since || undefined,
      tx_until: tx_until || undefined,
      audit_since: audit_since || undefined,
      audit_until: audit_until || undefined,
    }).catch(() => {}));
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");
    const fnameBase = `inventory_backup_${y}${m}${d}.json`;
    const fname = gzip ? `${fnameBase}.gz` : fnameBase;

    const headers: Record<string, string> = {
      "content-type": gzip ? "application/gzip" : "application/json; charset=utf-8",
      "cache-control": "no-store",
    };
    if (download) headers["content-disposition"] = `attachment; filename="${fname}"`;

    if (gzip) {
      // IMPORTANT: Do NOT set Content-Encoding:gzip here.
      // If we do, browsers may transparently decompress the download while keeping the .gz filename,
      // which will later break restore (it will look like .gz but is actually plain JSON).
      const gzStream = stream.pipeThrough(new CompressionStream("gzip"));
      return new Response(gzStream, { headers });
    }

    return new Response(stream, { headers });
  } catch (e: any) {
    return errorResponse(e);
  }
};
