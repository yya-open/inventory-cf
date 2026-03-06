import { json, requireAuth, errorResponse } from "../../_auth";
import { requireConfirm } from "../../_confirm";
import { logAudit } from "../_audit";
import { ensureCoreSchema } from "../_schema";
import { ensurePcSchema } from "../_pc";
import { ensureMonitorSchema } from "../_monitor";
import { DELETE_ORDER, INSERT_ORDER, TABLE_COLUMNS, pick } from "./restore_job/_util";

type RestoreBody = {
  mode?: "merge" | "replace";
  confirm?: string;
  backup?: {
    version?: string;
    exported_at?: string;
    tables?: Record<string, any[]>;
  };
};

// POST /api/admin/restore
// Admin-only. Restore from a backup JSON.
// mode:
//  - replace: 清空并恢复（需要 confirm="清空并恢复"）
//  - merge: 合并导入（需要 confirm="恢复"）
//
// 注意：Cloudflare D1 在 Pages Functions 环境中不建议使用 SQL BEGIN/COMMIT/ROLLBACK；
// 本实现使用 batch + 分块写入，尽量保证一致性。
export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    await ensureCoreSchema(env.DB);
    await ensurePcSchema(env.DB);
    await ensureMonitorSchema(env.DB);
    const body = (await request.json().catch(() => ({}))) as RestoreBody;
    const mode = body.mode || "merge";

    requireConfirm(body, mode === "replace" ? "清空并恢复" : "恢复", "二次确认不通过");

    const backup = body.backup;
    const tables = backup?.tables || {};

    if (!tables || typeof tables !== "object") {
      return Response.json({ ok: false, message: "缺少备份数据 tables" }, { status: 400 });
    }

    let insertedTotal = 0;
    const insertedByTable: Record<string, number> = {};

    if (mode === "replace") {
      const del = DELETE_ORDER.map((t) => env.DB.prepare(`DELETE FROM ${t}`));
      await env.DB.batch(del);
    }

    for (const t of INSERT_ORDER) {
      const rows = (tables as any)[t] as any[] | undefined;
      if (!rows?.length) continue;
      const cols = TABLE_COLUMNS[t];
      if (!cols) continue;

      const verb = mode === "merge" ? "INSERT OR IGNORE" : "INSERT OR REPLACE";
      const placeholders = cols.map(() => "?").join(",");
      const sql = `${verb} INTO ${t} (${cols.join(",")}) VALUES (${placeholders})`;

      let i = 0;
      let inserted = 0;
      while (i < rows.length) {
        const chunk = rows.slice(i, i + 50);
        const batch = chunk.map((r) => env.DB.prepare(sql).bind(...pick(r, cols)));
        const res = await env.DB.batch(batch);
        for (const rr of res) inserted += Number((rr as any)?.meta?.changes ?? 0);
        i += 50;
      }

      insertedByTable[t] = inserted;
      insertedTotal += inserted;
    }

    // Best-effort audit
    waitUntil(logAudit(env.DB, request, actor, "ADMIN_RESTORE", "backup", null, {
      mode,
      backup_version: backup?.version || null,
      exported_at: backup?.exported_at || null,
      inserted_total: insertedTotal,
      inserted_by_table: insertedByTable,
    }).catch(() => {}));
    return json(true, {
      mode,
      inserted_total: insertedTotal,
      inserted_by_table: insertedByTable,
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
