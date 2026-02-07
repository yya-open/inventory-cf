import { requireAuth, errorResponse } from "../../_auth";
import { logAudit } from "../_audit";

type BackupPayload = {
  version: string;
  exported_at: string;
  tables: Record<string, any[]>;
};

// GET /api/admin/backup
// Admin-only. Export selected tables as JSON.
// Query:
//  - include_tx=1, include_audit=1, include_stocktake=1, include_throttle=1
//  - download=1 (forces attachment)
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    const url = new URL(request.url);

    const include_tx = url.searchParams.get("include_tx") === "1";
    const include_audit = url.searchParams.get("include_audit") === "1";
    const include_stocktake = url.searchParams.get("include_stocktake") === "1";
    const include_throttle = url.searchParams.get("include_throttle") === "1";
    const download = url.searchParams.get("download") === "1";

    const tables: string[] = ["warehouses", "items", "stock", "users"];
    if (include_tx) tables.push("stock_tx");
    if (include_stocktake) tables.push("stocktake", "stocktake_line");
    if (include_audit) tables.push("audit_log");
    if (include_throttle) tables.push("auth_login_throttle");

    const out: BackupPayload = {
      version: "inventory-cf-backup-v1",
      exported_at: new Date().toISOString(),
      tables: {},
    };

    for (const t of tables) {
      const { results } = await env.DB.prepare(`SELECT * FROM ${t}`).all<any>();
      out.tables[t] = (results || []) as any[];
    }

    // Best-effort audit (don't block backup)
    logAudit(env.DB, request, actor, "ADMIN_BACKUP", "backup", null, {
      tables,
      exported_at: out.exported_at,
    }).catch(() => {});

    const body = JSON.stringify(out);
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");
    const fname = `inventory_backup_${y}${m}${d}.json`;

    const headers: Record<string, string> = {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    };
    if (download) headers["content-disposition"] = `attachment; filename="${fname}"`;

    return new Response(body, { headers });
  } catch (e: any) {
    return errorResponse(e);
  }
};
