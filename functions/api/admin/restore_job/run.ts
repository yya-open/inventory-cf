import { requireAuth, errorResponse, json } from '../../../_auth';
import { logAudit } from '../../_audit';
import { DELETE_ORDER, TABLE_COLUMNS, parseJsonSafe, pick, sniffGzipFromStream, readBackupJsonFromStream, getBackupTablesObject } from './_util';
import { buildBackupPayload } from '../_backup_helpers';
import { finalizeRestoreState } from '../_restore_finalize';

type Env = { DB: D1Database; JWT_SECRET: string; BACKUP_BUCKET: any };
type RestoreMode = 'merge' | 'merge_upsert' | 'replace';

async function createSnapshot(env: Env, actor: string, jobId: string) {
  const payload = await buildBackupPayload(env.DB, { actor, reason: `pre_restore_snapshot:${jobId}` });
  const snapshotKey = `restore-point/${jobId}/pre-restore.json`;
  const snapshotFilename = `pre_restore_${jobId}.json`;
  await env.BACKUP_BUCKET.put(snapshotKey, JSON.stringify(payload), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { created_by: actor, reason: 'pre_restore_snapshot' },
  });
  const restorePoints = [{ key: snapshotKey, filename: snapshotFilename, created_at: new Date().toISOString(), type: 'pre_restore' }];
  await env.DB.prepare(
    `UPDATE restore_job
     SET snapshot_key=?, snapshot_filename=?, snapshot_status='DONE', snapshot_created_at=datetime('now','+8 hours'), restore_points_json=?, stage='SCAN', updated_at=datetime('now','+8 hours')
     WHERE id=?`
  ).bind(snapshotKey, snapshotFilename, JSON.stringify(restorePoints), jobId).run();
  return { snapshotKey, snapshotFilename };
}

function buildInsertSql(mode: any, table: string, cols: string[]) {
  const placeholders = cols.map(() => '?').join(',');
  if (mode === 'merge') return `INSERT OR IGNORE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`;
  return `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`;
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, 'admin');
    const body = await request.json<any>().catch(() => ({}));
    const jobId = String(body?.id || '').trim();
    const maxRows = Math.min(Math.max(Number(body?.max_rows || 800), 50), 5000);
    const maxMs = Math.min(Math.max(Number(body?.max_ms || 8000), 1000), 25000);
    if (!jobId) return Response.json({ ok: false, message: '缺少 id' }, { status: 400 });
    if (!env.BACKUP_BUCKET) return Response.json({ ok: false, message: '未绑定 R2：BACKUP_BUCKET。请先在 Cloudflare 里绑定 R2 Bucket。' }, { status: 500 });

    const job = await env.DB.prepare(`SELECT * FROM restore_job WHERE id=?`).bind(jobId).first<any>();
    if (!job) return Response.json({ ok: false, message: '任务不存在' }, { status: 404 });
    if (job.status === 'DONE') return json(true, { id: jobId, status: 'DONE', stage: job.stage, more: false });
    if (job.status === 'FAILED') return json(true, { id: jobId, status: 'FAILED', stage: job.stage, more: false, last_error: job.last_error || null });

    await env.DB.prepare(`UPDATE restore_job SET status='RUNNING', updated_at=datetime('now','+8 hours') WHERE id=?`).bind(jobId).run();

    if (job.stage === 'SNAPSHOT') {
      try {
        if (job.mode !== 'replace') {
          await env.DB.prepare(
            `UPDATE restore_job
             SET snapshot_status='SKIPPED', stage='SCAN', updated_at=datetime('now','+8 hours')
             WHERE id=?`
          ).bind(jobId).run();
          waitUntil(logAudit(env.DB, request, actor, 'ADMIN_RESTORE_JOB_SNAPSHOT_SKIPPED', 'restore_job', jobId, { mode: job.mode || 'merge' }).catch(() => {}));
          return json(true, { id: jobId, status: 'RUNNING', stage: 'SCAN', snapshot_status: 'SKIPPED', more: true });
        }
        await env.DB.prepare(`UPDATE restore_job SET snapshot_status='RUNNING', updated_at=datetime('now','+8 hours') WHERE id=?`).bind(jobId).run();
        const snap = await createSnapshot(env, actor.username, jobId);
        waitUntil(logAudit(env.DB, request, actor, 'ADMIN_RESTORE_JOB_SNAPSHOT_DONE', 'restore_job', jobId, snap).catch(() => {}));
        return json(true, { id: jobId, status: 'RUNNING', stage: 'SCAN', snapshot_status: 'DONE', more: true });
      } catch (e: any) {
        await env.DB.prepare(`UPDATE restore_job SET status='FAILED', snapshot_status='FAILED', last_error=?, updated_at=datetime('now','+8 hours') WHERE id=?`).bind(String(e?.message || e), jobId).run();
        return Response.json({ ok: false, message: String(e?.message || e) }, { status: 500 });
      }
    }

    const obj = await env.BACKUP_BUCKET.get(job.file_key);
    if (!obj?.body) {
      await env.DB.prepare(`UPDATE restore_job SET status='FAILED', last_error=?, updated_at=datetime('now','+8 hours') WHERE id=?`).bind('R2 文件不存在或已被删除', jobId).run();
      return Response.json({ ok: false, message: 'R2 文件不存在或已被删除' }, { status: 500 });
    }

    if (job.stage === 'SCAN') {
      const perTable: any = { __order__: Object.keys(TABLE_COLUMNS), __present__: {} as Record<string, boolean> };
      const counts: Record<string, number> = Object.fromEntries(Object.keys(TABLE_COLUMNS).map((t) => [t, 0]));
      let total = 0;

      const sniffScan = await sniffGzipFromStream(obj.body);
      const backup = await readBackupJsonFromStream(sniffScan.stream, sniffScan.gzip);
      const tables = getBackupTablesObject(backup);
      for (const [t, rows] of Object.entries(tables)) {
        if (!TABLE_COLUMNS[t]) continue;
        perTable.__present__[t] = true;
        const n = Array.isArray(rows) ? rows.length : 0;
        counts[t] = n;
        total += n;
      }
      for (const t of Object.keys(TABLE_COLUMNS)) perTable[t] = counts[t] || 0;
      const order: string[] = perTable.__order__;
      const cursor = order.length ? { table: order[0], row: 0 } : { table: '', row: 0 };
      await env.DB.prepare(`UPDATE restore_job SET stage='RESTORE', total_rows=?, per_table_json=?, cursor_json=?, current_table=?, updated_at=datetime('now','+8 hours') WHERE id=?`)
        .bind(total, JSON.stringify(perTable), JSON.stringify(cursor), cursor.table || null, jobId).run();
      waitUntil(logAudit(env.DB, request, actor, 'ADMIN_RESTORE_JOB_SCAN_DONE', 'restore_job', jobId, { total_rows: total }).catch(() => {}));
      return json(true, { id: jobId, status: 'RUNNING', stage: 'RESTORE', total_rows: total, processed_rows: Number(job.processed_rows || 0), more: true });
    }

    const mode = ((job.mode as RestoreMode) || 'merge');
    if (mode === 'replace' && Number(job.replaced_done || 0) === 0) {
      const stmts = DELETE_ORDER.map((t) => env.DB.prepare(`DELETE FROM ${t}`));
      await env.DB.batch(stmts);
      await env.DB.prepare(`UPDATE restore_job SET replaced_done=1, updated_at=datetime('now','+8 hours') WHERE id=?`).bind(jobId).run();
    }

    const cursor = parseJsonSafe(job.cursor_json || '{}', { table: '', row: 0 });
    const perTable = parseJsonSafe(job.per_table_json || '{}', { __order__: [] });
    const order: string[] = Array.isArray(perTable.__order__) ? perTable.__order__ : [];
    const cursorTable = String(cursor.table || '');
    const cursorRow = Number(cursor.row || 0);
    const cursorTableIndex = cursorTable ? order.indexOf(cursorTable) : -1;

    let processedThisRun = 0;
    const processedByTable: Record<string, number> = {};
    const insertedByTable: Record<string, number> = {};
    let lastTable = cursorTable;
    let lastNextRow = cursorRow;
    const startTime = Date.now();

    const runObj = await env.BACKUP_BUCKET.get(job.file_key);
    if (!runObj?.body) throw new Error('R2 文件读取失败（RESTORE）');

    try {
      let curTable = '';
      let curTableIndex = -1;
      let rowIndexInTable = -1;
      let cols: string[] | null = null;
      let sql = '';
      let batch: D1PreparedStatement[] = [];
      let batchTable = '';
      let batchRows = 0;
      let exhaustedAllTables = true;

      const flush = async () => {
        if (!batch.length) return;
        const res = await env.DB.batch(batch);
        let changes = 0;
        for (const rr of res) changes += Number((rr as any)?.meta?.changes ?? 0);
        if (batchTable) {
          insertedByTable[batchTable] = (insertedByTable[batchTable] || 0) + changes;
          processedByTable[batchTable] = (processedByTable[batchTable] || 0) + batchRows;
        }
        batch = [];
        batchTable = '';
        batchRows = 0;
      };

      const sniff2 = await sniffGzipFromStream(runObj.body);
      const backup = await readBackupJsonFromStream(sniff2.stream, sniff2.gzip);
      const tables = getBackupTablesObject(backup);
      outer:
      for (const table of order) {
        if (!TABLE_COLUMNS[table] || table === 'restore_job') continue;
        const rows = Array.isArray((tables as any)[table]) ? (tables as any)[table] : [];
        curTable = table;
        curTableIndex = order.indexOf(table);
        cols = TABLE_COLUMNS[table];
        sql = buildInsertSql(mode, table, cols);
        batchTable = table;
        for (let idx = 0; idx < rows.length; idx++) {
          rowIndexInTable = idx;
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
          const objRow = rows[idx] as Record<string, any>;
          batch.push(env.DB.prepare(sql).bind(...pick(objRow, cols!)));
          batchRows += 1;
          processedThisRun += 1;
          lastTable = table;
          lastNextRow = rowIndexInTable + 1;
          if (batch.length >= 50) await flush();
          if (processedThisRun >= maxRows) { exhaustedAllTables = false; break outer; }
          if (Date.now() - startTime >= maxMs) { exhaustedAllTables = false; break outer; }
        }
        await flush();
      }
      await flush();

      const processedRowsNew = Number(job.processed_rows || 0) + processedThisRun;
      const totalRows = Number(job.total_rows || 0);
      const nextCursor = { table: lastTable || '', row: lastNextRow || 0 };

      const processedMap: Record<string, number> = (perTable.__processed__ && typeof perTable.__processed__ === 'object') ? perTable.__processed__ : {};
      const insertedMap: Record<string, number> = (perTable.__inserted__ && typeof perTable.__inserted__ === 'object') ? perTable.__inserted__ : {};
      for (const [t, n] of Object.entries(processedByTable)) processedMap[t] = (processedMap[t] || 0) + Number(n || 0);
      for (const [t, n] of Object.entries(insertedByTable)) insertedMap[t] = (insertedMap[t] || 0) + Number(n || 0);
      perTable.__processed__ = processedMap;
      perTable.__inserted__ = insertedMap;

      const restorableOrder = order.filter((t) => !!TABLE_COLUMNS[t] && t !== 'restore_job');
      const tablesComplete = restorableOrder.every((t) => Number(processedMap[t] || 0) >= Number(perTable[t] || 0));
      const done = exhaustedAllTables && tablesComplete && (totalRows > 0 ? processedRowsNew >= totalRows : true);
      const currentTableForSave = done ? null : (nextCursor.table || null);
      const cursorForSave = done ? { table: '', row: 0 } : nextCursor;

      await env.DB.prepare(`UPDATE restore_job SET processed_rows=?, current_table=?, cursor_json=?, per_table_json=?, updated_at=datetime('now','+8 hours') WHERE id=?`)
        .bind(processedRowsNew, currentTableForSave, JSON.stringify(cursorForSave), JSON.stringify(perTable), jobId).run();

      if (done) {
        await finalizeRestoreState(env.DB);
        await env.DB.prepare(`UPDATE restore_job SET status='DONE', completed_at=datetime('now','+8 hours'), current_table=NULL, cursor_json='{"table":"","row":0}', updated_at=datetime('now','+8 hours') WHERE id=?`).bind(jobId).run();
        waitUntil(logAudit(env.DB, request, actor, 'ADMIN_RESTORE_JOB_DONE', 'restore_job', jobId, { processed_rows: processedRowsNew, total_rows: totalRows }).catch(() => {}));
      }

      return json(true, {
        id: jobId,
        status: done ? 'DONE' : 'RUNNING',
        stage: 'RESTORE',
        processed_delta: processedThisRun,
        processed_rows: processedRowsNew,
        total_rows: totalRows,
        current_table: currentTableForSave,
        snapshot_status: job.snapshot_status || null,
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
