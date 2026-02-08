import { requireAuth, errorResponse } from "../../_auth";
import { logAudit } from "../_audit";

type BackupPayload = {
  version: string;
  exported_at: string;
  tables: Record<string, any[]>;
};

const DEFAULT_PAGE_SIZE = 1000;
const MAX_PAGE_SIZE = 5000;

function toSqlRange(dateStr?: string | null, endOfDay?: boolean) {
  if (!dateStr) return null;
  // Accept YYYY-MM-DD or ISO-like strings; we normalize YYYY-MM-DD to sqlite datetime format.
  const s = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return endOfDay ? `${s} 23:59:59` : `${s} 00:00:00`;
  }
  return s;
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
  // All tables in this project use an auto-increment numeric `id` primary key.
  // We paginate by `id` to keep memory usage flat and performance stable.
  let lastId = 0;
  let firstRow = true;

  const whereSql = extraWhereSql ? ` AND ${extraWhereSql}` : "";

  while (true) {
    const stmt = DB.prepare(`SELECT * FROM ${table} WHERE id > ?${whereSql} ORDER BY id LIMIT ?`);
    const binds = [lastId, ...(extraBinds || []), pageSize];

    const { results } = await stmt.bind(...binds).all<any>();
    if (!results || results.length === 0) break;

    for (const row of results) {
      if (!firstRow) controller.enqueue(encoder.encode(","));
      firstRow = false;

      controller.enqueue(encoder.encode(JSON.stringify(row)));

      // Advance cursor. If `id` is missing for any reason, we stop paginating to avoid an infinite loop.
      if (typeof row?.id === "number") lastId = row.id;
      else return;
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

    const allowTables = new Set([
      "warehouses",
      "items",
      "stock",
      "users",
      "stock_tx",
      "stocktake",
      "stocktake_line",
      "audit_log",
      "auth_login_throttle",
    ]);

    let tables: string[] = ["warehouses", "items", "stock", "users"];
    if (include_tx) tables.push("stock_tx");
    if (include_stocktake) tables.push("stocktake", "stocktake_line");
    if (include_audit) tables.push("audit_log");
    if (include_throttle) tables.push("auth_login_throttle");

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
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    };
    if (download) headers["content-disposition"] = `attachment; filename="${fname}"`;

    if (gzip) {
      // IMPORTANT: do NOT set Content-Encoding=gzip here.
      // Browsers/fetch would transparently decompress, causing the saved .gz file to actually be plain JSON.
      // We instead return the raw gzip bytes with an appropriate content-type.
      headers["content-type"] = "application/gzip";
      const gzStream = stream.pipeThrough(new CompressionStream("gzip"));
      return new Response(gzStream, { headers });
    }

    return new Response(stream, { headers });
  } catch (e: any) {
    return errorResponse(e);
  }
};
