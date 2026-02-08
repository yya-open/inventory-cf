import { requireAuth, errorResponse, json } from "../../../_auth";
import { logAudit } from "../../_audit";
import { DELETE_ORDER, TABLE_COLUMNS, pick, iterBackupRowsFromStream, sniffGzipFromStream } from "./_util";

type Env = { DB: D1Database; JWT_SECRET: string; BACKUP_BUCKET: any };
type RestoreMode = "merge" | "replace";

function parseJsonSafe(s: string, fallback: any) {
  try { return JSON.parse(s || ""); } catch { return fallback; }
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
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
    if (job.status === "PAUSED") {
      // resume
      await env.DB.prepare(`UPDATE restore_job SET status='RUNNING', updated_at=datetime('now') WHERE id=?`).bind(jobId).run();
      job.status = "RUNNING";
    }
    if (job.status === "QUEUED") {
      await env.DB.prepare(`UPDATE restore_job SET status='RUNNING', updated_at=datetime('now') WHERE id=?`).bind(jobId).run();
      job.status = "RUNNING";
    }

    if (!env.BACKUP_BUCKET) {
      return Response.json({ ok: false, message: "未绑定 R2：BACKUP_BUCKET。请先在 Cloudflare 里绑定 R2 Bucket。" }, { status: 500 });
    }

    const obj = await env.BACKUP_BUCKET.get(job.file_key);
    if (!obj || !obj.body) {
      await env.DB.prepare(`UPDATE restore_job SET status='FAILED', last_error=?, updated_at=datetime('now') WHERE id=?`)
        .bind("R2 文件不存在或已被删除", jobId).run();
      return Response.json({ ok: false, message: "R2 文件不存在或已被删除" }, { status: 500 });
    }


    // Stage 1: scan and count totals (one full pass without DB writes)
    if (job.stage === "SCAN") {
      const perTable: any = { __order__: [] as string[] };
      let total = 0;

      const order: string[] = [];
      const counts: Record<string, number> = {};

      // Need a fresh stream; R2 object body is single-use -> re-get
      const scanObj = await env.BACKUP_BUCKET.get(job.file_key);
      if (!scanObj?.body) throw new Error("R2 文件读取失败（SCAN）");

      const sniff1 = await sniffGzipFromStream(scanObj.body);
      for await (const { table } of iterBackupRowsFromStream(sniff1.stream, sniff1.gzip)) {
        if (!TABLE_COLUMNS[table]) continue;
        if (!counts[table]) {
          counts[table] = 0;
          order.push(table);
        }
        counts[table] += 1;
        total += 1;
      }

      perTable.__order__ = order;
      for (const [t, c] of Object.entries(counts)) perTable[t] = c;

      const cursor = order.length ? { table: order[0], row: 0 } : { table: "", row: 0 };

      await env.DB.prepare(
        `UPDATE restore_job SET stage='RESTORE', total_rows=?, per_table_json=?, cursor_json=?, current_table=?, updated_at=datetime('now') WHERE id=?`
      )
        .bind(total, JSON.stringify(perTable), JSON.stringify(cursor), cursor.table || null, jobId)
        .run();

      waitUntil(logAudit(env.DB, request, actor, "ADMIN_RESTORE_JOB_SCAN_DONE", "restore_job", jobId, { total_rows: total }).catch(() => {}));
      return json(true, { id: jobId, status: "RUNNING", stage: "RESTORE", total_rows: total, processed_rows: Number(job.processed_rows || 0), more: true });
    }

    // Stage 2: restore incrementally
    const mode = (job.mode as RestoreMode) || "merge";
    const verb = mode === "merge" ? "INSERT OR IGNORE" : "INSERT OR REPLACE";

    // Replace-mode: do delete once
    if (mode === "replace" && Number(job.replaced_done || 0) === 0) {
      try {
        const stmts = DELETE_ORDER.map((t) => env.DB.prepare(`DELETE FROM ${t}`));
        await env.DB.batch(stmts);
        await env.DB.prepare(`UPDATE restore_job SET replaced_done=1, updated_at=datetime('now') WHERE id=?`).bind(jobId).run();
        } catch (e) {
        throw e;
      }
    }

    // Cursor and per-table order
    const cursor = parseJsonSafe(job.cursor_json || "{}", { table: "", row: 0 });
    const perTable = parseJsonSafe(job.per_table_json || "{}", { __order__: [] });
    const order: string[] = Array.isArray(perTable.__order__) ? perTable.__order__ : [];
    const cursorTable = String(cursor.table || "");
    const cursorRow = Number(cursor.row || 0);
    const cursorTableIndex = cursorTable ? order.indexOf(cursorTable) : -1;

    let processedThisRun = 0;
    let lastTable = cursorTable;
    let lastNextRow = cursorRow;

    const startTime = Date.now();

    // Fresh stream again for this run
    const runObj = await env.BACKUP_BUCKET.get(job.file_key);
    if (!runObj?.body) throw new Error("R2 文件读取失败（RESTORE）");

    // We commit incrementally each run; each run chunk is atomic for its own rows.
    try {
      let curTable = "";
      let curTableIndex = -1;
      let rowIndexInTable = -1;

      let cols: string[] | null = null;
      let sql = "";
      let batch: D1PreparedStatement[] = [];
      let inserted = 0;

      const flush = async () => {
        if (!batch.length) return;
        const res = await env.DB.batch(batch);
        for (const rr of res) inserted += Number((rr as any)?.meta?.changes ?? 0);
        batch = [];
      };

      const sniff2 = await sniffGzipFromStream(runObj.body);
      for await (const { table, rowText } of iterBackupRowsFromStream(sniff2.stream, sniff2.gzip)) {
        if (!TABLE_COLUMNS[table]) continue;

        if (table !== curTable) {
          await flush();
          curTable = table;
          curTableIndex = order.indexOf(table);
          rowIndexInTable = -1;

          cols = TABLE_COLUMNS[table];
          const placeholders = cols.map(() => "?").join(",");
          sql = `${verb} INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`;
        }

        rowIndexInTable += 1;

        // Skip to cursor
        if (cursorTableIndex >= 0) {
          if (curTableIndex < cursorTableIndex) continue;
          if (curTableIndex === cursorTableIndex && rowIndexInTable < cursorRow) continue;
        }

        // Pause check (cheap): read status occasionally
        if ((processedThisRun % 200) === 0) {
          const s = await env.DB.prepare(`SELECT status FROM restore_job WHERE id=?`).bind(jobId).first<any>();
          if (s?.status === "PAUSED" || s?.status === "CANCELED") {
            await flush();
            return json(true, { id: jobId, status: s.status, more: false });
          }
        }

        const objRow = JSON.parse(rowText);
        batch.push(env.DB.prepare(sql).bind(...pick(objRow, cols!)));

        processedThisRun += 1;
        lastTable = table;
        lastNextRow = rowIndexInTable + 1;

        if (batch.length >= 50) await flush();

        if (processedThisRun >= maxRows) break;
        if (Date.now() - startTime >= maxMs) break;
      }

      await flush();

      // Update job progress & cursor
      const processedRowsNew = Number(job.processed_rows || 0) + processedThisRun;

      // Determine if done
      const totalRows = Number(job.total_rows || 0);
      const done = totalRows > 0 ? processedRowsNew >= totalRows : false;

      const nextCursor = { table: lastTable || "", row: lastNextRow || 0 };

      await env.DB.prepare(
        `UPDATE restore_job SET processed_rows=?, current_table=?, cursor_json=?, updated_at=datetime('now') WHERE id=?`
      )
        .bind(processedRowsNew, nextCursor.table || null, JSON.stringify(nextCursor), jobId)
        .run();

      if (done) {
        await env.DB.prepare(`UPDATE restore_job SET status='DONE', updated_at=datetime('now') WHERE id=?`).bind(jobId).run();
      }

      const more = !done;
      if (done) {
        waitUntil(logAudit(env.DB, request, actor, "ADMIN_RESTORE_JOB_DONE", "restore_job", jobId, { inserted_changes: inserted }).catch(() => {}));
      }

      return json(true, {
        id: jobId,
        status: done ? "DONE" : "RUNNING",
        stage: "RESTORE",
        processed_delta: processedThisRun,
        processed_rows: processedRowsNew,
        total_rows: totalRows,
        current_table: nextCursor.table || null,
        more,
      });
    } catch (e: any) {
      await env.DB.prepare(`UPDATE restore_job SET status='FAILED', error_count=error_count+1, last_error=?, updated_at=datetime('now') WHERE id=?`)
        .bind(String(e?.message || e), jobId).run();
      return Response.json({ ok: false, message: String(e?.message || e) }, { status: 500 });
    }
  } catch (e: any) {
    return errorResponse(e);
  }
};
