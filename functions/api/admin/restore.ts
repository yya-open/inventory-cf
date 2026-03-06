import { json, requireAuth, errorResponse } from "../../_auth";
import { requireConfirm } from "../../_confirm";
import { logAudit } from "../_audit";
import { ensureCoreSchema } from "../_schema";
import { ensurePcSchema } from "../_pc";
import { ensureMonitorSchema } from "../_monitor";
import { buildRestoreInsertSql, getAllTableSchemas, INTERNAL_SKIP_TABLES, pick, sampleRowColumns, sortTablesForDelete, sortTablesForInsert } from "./_backup_schema";

type RestoreBody = {
  mode?: "merge" | "merge_upsert" | "replace";
  confirm?: string;
  backup?: {
    version?: string;
    exported_at?: string;
    schema?: Record<string, any>;
    tables?: Record<string, any[]>;
  };
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    await ensureCoreSchema(env.DB);
    await ensurePcSchema(env.DB);
    await ensureMonitorSchema(env.DB);
    const body = (await request.json().catch(() => ({}))) as RestoreBody;
    const mode = body.mode || "merge";

    requireConfirm(body, mode === "replace" ? "清空并恢复" : (mode === "merge_upsert" ? "覆盖导入" : "恢复"), "二次确认不通过");

    const backup = body.backup;
    const tables = backup?.tables || {};
    if (!tables || typeof tables !== "object") return Response.json({ ok: false, message: "缺少备份数据 tables" }, { status: 400 });

    const dbSchema = await getAllTableSchemas(env.DB, { includeInternal: true });
    const tableNames = sortTablesForInsert([...new Set(Object.keys(tables).filter((t) => !INTERNAL_SKIP_TABLES.has(t)))])
      .filter((t) => !!dbSchema[t]);

    let insertedTotal = 0;
    const insertedByTable: Record<string, number> = {};

    if (mode === "replace") {
      const del = sortTablesForDelete(tableNames).map((t) => env.DB.prepare(`DELETE FROM "${t.replace(/"/g, '""')}"`));
      if (del.length) await env.DB.batch(del);
    }

    for (const t of tableNames) {
      const rows = (tables as any)[t] as any[] | undefined;
      if (!rows?.length) continue;
      const dbCols = dbSchema[t].columns.map((c) => c.name);
      const backupCols = Array.isArray((backup?.schema as any)?.[t]?.columns)
        ? ((backup?.schema as any)[t].columns || []).map((x: any) => String(x?.name || '').trim()).filter(Boolean)
        : sampleRowColumns(rows);
      const cols = dbCols.filter((c) => backupCols.includes(c));
      if (!cols.length) continue;
      const sql = buildRestoreInsertSql(t, cols, mode, dbSchema[t].unique_keys);

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

    waitUntil(logAudit(env.DB, request, actor, "ADMIN_RESTORE", "backup", null, {
      mode,
      backup_version: backup?.version || null,
      exported_at: backup?.exported_at || null,
      inserted_total: insertedTotal,
      inserted_by_table: insertedByTable,
    }).catch(() => {}));
    return json(true, { mode, inserted_total: insertedTotal, inserted_by_table: insertedByTable });
  } catch (e: any) {
    return errorResponse(e);
  }
};
