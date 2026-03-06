import { requireAuth, errorResponse, json } from "../../../_auth";
import { logAudit } from "../../_audit";
import { ensureCoreSchema } from "../../_schema";
import { ensurePcSchema } from "../../_pc";
import { ensureMonitorSchema } from "../../_monitor";
import { buildRestoreInsertSql, INTERNAL_SKIP_TABLES, iterBackupRowsFromStream, iterBackupTableKeysFromStream, pick, sniffGzipFromStream, sortTablesForDelete, sortTablesForInsert } from "./_util";
import { getAllTableSchemas } from "../_backup_schema";

type Env = { DB: D1Database; JWT_SECRET: string; BACKUP_BUCKET: any };
type RestoreMode = "merge" | "merge_upsert" | "replace";

function parseJsonSafe(s: string, fallback: any) {
  try { return JSON.parse(s || ""); } catch { return fallback; }
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    await ensureCoreSchema(env.DB);
    await ensurePcSchema(env.DB);
    await ensureMonitorSchema(env.DB);
    const body = await request.json<any>().catch(() => ({}));
    const jobId = String(body.id || "").trim();
    const maxRows = Math.min(Math.max(Number(body.max_rows || 2000), 100), 20000);
    const maxMs = Math.min(Math.max(Number(body.max_ms || 8000), 1000), 20000);
    if (!jobId) return Response.json({ ok: false, message: "缺少 id" }, { status: 400 });

    const job = await env.DB.prepare(`SELECT * FROM restore_job WHERE id=?`).bind(jobId).first<any>();
    if (!job) return Response.json({ ok: false, message: "任务不存在" }, { status: 404 });
    if (job.status === "DONE") return json(true, { id: jobId, status: "DONE", more: false });
    if (job.status === "FAILED") return json(true, { id: jobId, status: "FAILED", more: false, last_error: job.last_error || null });
    if (job.status === "CANCELED") return json(true, { id: jobId, status: "CANCELED", more: false });
    if (job.status === "PAUSED" || job.status === "QUEUED") {
      await env.DB.prepare(`UPDATE restore_job SET status='RUNNING', updated_at=datetime('now','+8 hours') WHERE id=?`).bind(jobId).run();
    }

    if (!env.BACKUP_BUCKET) {
      return Response.json({ ok: false, message: "未绑定 R2：BACKUP_BUCKET。请先在 Cloudflare 里绑定 R2 Bucket。" }, { status: 500 });
    }

    const dbSchema = await getAllTableSchemas();
    const dbTableNames = Object.keys(dbSchema).filter((t) => !INTERNAL_SKIP_TABLES.has(t));

    const obj = await env.BACKUP_BUCKET.get(job.file_key);
    if (!obj?.body) {
      await env.DB.prepare(`UPDATE restore_job SET status='FAILED', last_error=?, updated_at=datetime('now','+8 hours') WHERE id=?`).bind("R2 文件不存在或已被删除", jobId).run();
      return Response.json({ ok: false, message: "R2 文件不存在或已被删除" }, { status: 500 });
    }

    if (job.stage === "SCAN") {
      const perTable: any = { __order__: [] as string[], __present__: {} as Record<string, boolean>, __schema__: {} as Record<string, any> };
      let total = 0;

      const scanObj = await env.BACKUP_BUCKET.get(job.file_key);
      if (!scanObj?.body) throw new Error("R2 文件读取失败（SCAN）");
      const sniffKeys = await sniffGzipFromStream(scanObj.body);
      const present: Record<string, boolean> = {};
      for await (const t of iterBackupTableKeysFromStream(sniffKeys.stream, sniffKeys.gzip)) {
        if (INTERNAL_SKIP_TABLES.has(t)) continue;
        present[t] = true;
      }

      const order = sortTablesForInsert([...new Set([...dbTableNames, ...Object.keys(present)])]);
      const counts: Record<string, number> = {};
      for (const t of order) counts[t] = 0;
      for (const t of order) {
        const schema = dbSchema[t];
        perTable.__schema__[t] = schema ? {
          columns: schema.columns.map((c) => c.name),
          unique_keys: schema.unique_keys,
        } : null;
      }

      const scanObj2 = await env.BACKUP_BUCKET.get(job.file_key);
      if (!scanObj2?.body) throw new Error("R2 文件读取失败（SCAN-2）");
      const sniff1 = await sniffGzipFromStream(scanObj2.body);
      for await (const { table } of iterBackupRowsFromStream(sniff1.stream, sniff1.gzip)) {
        if (INTERNAL_SKIP_TABLES.has(table) || !order.includes(table)) continue;
        counts[table] = Number(counts[table] || 0) + 1;
        total += 1;
        present[table] = true;
      }

      perTable.__order__ = order;
      perTable.__present__ = present;
      for (const t of order) perTable[t] = Number(counts[t] || 0);

      const cursor = order.length ? { table: order[0], row: 0 } : { table: "", row: 0 };
      await env.DB.prepare(`UPDATE restore_job SET stage='RESTORE', total_rows=?, per_table_json=?, cursor_json=?, current_table=?, updated_at=datetime('now','+8 hours') WHERE id=?`)
        .bind(total, JSON.stringify(perTable), JSON.stringify(cursor), cursor.table || null, jobId)
        .run();

      waitUntil(logAudit(env.DB, request, actor, "ADMIN_RESTORE_JOB_SCAN_DONE", "restore_job", jobId, { total_rows: total, tables: order }).catch(() => {}));
      return json(true, { id: jobId, status: "RUNNING", stage: "RESTORE", total_rows: total, processed_rows: Number(job.processed_rows || 0), more: true });
    }

    const mode = ((job.mode as RestoreMode) || "merge");
    const perTable = parseJsonSafe(job.per_table_json || "{}", { __order__: [] });
    const order: string[] = Array.isArray(perTable.__order__) ? perTable.__order__ : [];
    const schemaMap: Record<string, any> = (perTable.__schema__ && typeof perTable.__schema__ === 'object') ? perTable.__schema__ : {};

    if (mode === "replace" && Number(job.replaced_done || 0) === 0) {
      const deleteTables = sortTablesForDelete(order.length ? order : dbTableNames).filter((t) => dbSchema[t]);
      const stmts = deleteTables.map((t) => env.DB.prepare(`DELETE FROM "${t.replace(/"/g, '""')}"`));
      await env.DB.batch(stmts);
      await env.DB.prepare(`UPDATE restore_job SET replaced_done=1, updated_at=datetime('now','+8 hours') WHERE id=?`).bind(jobId).run();
    }

    const cursor = parseJsonSafe(job.cursor_json || "{}", { table: "", row: 0 });
    const cursorTable = String(cursor.table || "");
    const cursorRow = Number(cursor.row || 0);
    const cursorTableIndex = cursorTable ? order.indexOf(cursorTable) : -1;

    let processedThisRun = 0;
    const processedByTable: Record<string, number> = {};
    const insertedByTable: Record<string, number> = {};
    let lastTable = cursorTable;
    let lastNextRow = cursorRow;
    const startTime = Date.now();

    const runObj = await env.BACKUP_BUCKET.get(job.file_key);
    if (!runObj?.body) throw new Error("R2 文件读取失败（RESTORE）");

    try {
      let curTable = "";
      let curTableIndex = -1;
      let rowIndexInTable = -1;
      let cols: string[] | null = null;
      let sql = "";
      let batch: D1PreparedStatement[] = [];
      let batchTable = "";
      let batchRows = 0;
      let inserted = 0;

      const flush = async () => {
        if (!batch.length) return;
        const res = await env.DB.batch(batch);
        let changes = 0;
        for (const rr of res) changes += Number((rr as any)?.meta?.changes ?? 0);
        inserted += changes;
        if (batchTable) {
          insertedByTable[batchTable] = (insertedByTable[batchTable] || 0) + changes;
          processedByTable[batchTable] = (processedByTable[batchTable] || 0) + batchRows;
        }
        batch = [];
        batchTable = "";
        batchRows = 0;
      };

      const sniff2 = await sniffGzipFromStream(runObj.body);
      for await (const { table, rowText } of iterBackupRowsFromStream(sniff2.stream, sniff2.gzip)) {
        if (INTERNAL_SKIP_TABLES.has(table) || !dbSchema[table]) continue;
        if (table !== curTable) {
          await flush();
          curTable = table;
          curTableIndex = order.indexOf(table);
          rowIndexInTable = -1;
          cols = null;
          sql = "";
        }
        rowIndexInTable += 1;

        if (cursorTableIndex >= 0) {
          if (curTableIndex < cursorTableIndex) continue;
          if (curTableIndex === cursorTableIndex && rowIndexInTable < cursorRow) continue;
        }

        if ((processedThisRun % 200) === 0) {
          const s = await env.DB.prepare(`SELECT status FROM restore_job WHERE id=?`).bind(jobId).first<any>();
          if (s?.status === 'PAUSED' || s?.status === 'CANCELED') {
            await flush();
            return json(true, { id: jobId, status: s.status, more: false });
          }
        }

        const objRow = JSON.parse(rowText);
        if (!cols) {
          const dbCols: string[] = Array.isArray(schemaMap?.[table]?.columns) ? schemaMap[table].columns : dbSchema[table].columns.map((c) => c.name);
          const rowCols = Object.keys(objRow || {});
          cols = dbCols.filter((c) => rowCols.includes(c));
          if (!cols.length) {
            cols = dbCols.filter((c) => !(dbSchema[table].columns.find((x) => x.name === c)?.notnull));
          }
          if (!cols.length) continue;
          const uniqueKeys = Array.isArray(schemaMap?.[table]?.unique_keys) ? schemaMap[table].unique_keys : dbSchema[table].unique_keys;
          sql = buildRestoreInsertSql(table, cols, mode, uniqueKeys);
          batchTable = table;
        }

        if (!batchTable) batchTable = table;
        batch.push(env.DB.prepare(sql).bind(...pick(objRow, cols)));
        batchRows += 1;
        processedThisRun += 1;
        lastTable = table;
        lastNextRow = rowIndexInTable + 1;

        if (batch.length >= 50) await flush();
        if (processedThisRun >= maxRows) break;
        if (Date.now() - startTime >= maxMs) break;
      }

      await flush();
      const processedRowsNew = Number(job.processed_rows || 0) + processedThisRun;
      const totalRows = Number(job.total_rows || 0);
      const done = totalRows > 0 ? processedRowsNew >= totalRows : false;
      const nextCursor = { table: lastTable || '', row: lastNextRow || 0 };
      const processedMap: Record<string, number> = (perTable.__processed__ && typeof perTable.__processed__ === 'object') ? perTable.__processed__ : {};
      const insertedMap: Record<string, number> = (perTable.__inserted__ && typeof perTable.__inserted__ === 'object') ? perTable.__inserted__ : {};
      for (const [t, n] of Object.entries(processedByTable)) processedMap[t] = (processedMap[t] || 0) + Number(n || 0);
      for (const [t, n] of Object.entries(insertedByTable)) insertedMap[t] = (insertedMap[t] || 0) + Number(n || 0);
      perTable.__processed__ = processedMap;
      perTable.__inserted__ = insertedMap;

      await env.DB.prepare(`UPDATE restore_job SET processed_rows=?, current_table=?, cursor_json=?, per_table_json=?, updated_at=datetime('now','+8 hours') WHERE id=?`)
        .bind(processedRowsNew, nextCursor.table || null, JSON.stringify(nextCursor), JSON.stringify(perTable), jobId)
        .run();
      if (done) {
        await env.DB.prepare(`UPDATE restore_job SET status='DONE', updated_at=datetime('now','+8 hours') WHERE id=?`).bind(jobId).run();
        waitUntil(logAudit(env.DB, request, actor, 'ADMIN_RESTORE_JOB_DONE', 'restore_job', jobId, { inserted_changes: inserted }).catch(() => {}));
      }

      return json(true, {
        id: jobId,
        status: done ? 'DONE' : 'RUNNING',
        stage: 'RESTORE',
        processed_delta: processedThisRun,
        processed_rows: processedRowsNew,
        total_rows: totalRows,
        current_table: nextCursor.table || null,
        more: !done,
      });
    } catch (e: any) {
      await env.DB.prepare(`UPDATE restore_job SET status='FAILED', error_count=error_count+1, last_error=?, updated_at=datetime('now','+8 hours') WHERE id=?`).bind(String(e?.message || e), jobId).run();
      return Response.json({ ok: false, message: String(e?.message || e) }, { status: 500 });
    }
  } catch (e: any) {
    return errorResponse(e);
  }
};
