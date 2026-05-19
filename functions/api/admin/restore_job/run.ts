import { requireAuth, json } from '../../../_auth';
import { withErrorHandling } from '../../_error';
import { apiFail } from '../../_response';
import { logAudit } from '../../_audit';
import { DELETE_ORDER, TABLE_COLUMNS, parseJsonSafe, pick, sniffGzipFromStream, iterBackupRowsFromStream, readBackupEnvelopeMetadataFromStream } from './_util';
import { createBackupJsonStream } from '../_backup_helpers';
import { chainSha256, sha256JsonHex, type BackupIntegrity, type BackupManifest, type BackupValidationIssue } from '../_backup_integrity';
import { BACKUP_VERSION, LEGACY_BACKUP_VERSIONS } from '../_backup_schema';
import { finalizeRestoreState } from '../_restore_finalize';
import { buildRestoreVerification } from '../../services/data-integrity';
import { sqlNowStored } from '../../_time';

type Env = { DB: D1Database; JWT_SECRET: string; BACKUP_BUCKET: any };
type RestoreMode = 'merge' | 'merge_upsert' | 'replace';

async function createSnapshot(env: Env, actor: string, jobId: string) {
  const payload = await createBackupJsonStream(env.DB, { actor, reason: `pre_restore_snapshot:${jobId}` });
  const snapshotKey = `restore-point/${jobId}/pre-restore.json`;
  const snapshotFilename = `pre_restore_${jobId}.json`;
  await env.BACKUP_BUCKET.put(snapshotKey, payload.stream, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { created_by: actor, reason: 'pre_restore_snapshot' },
  });
  const restorePoints = [{ key: snapshotKey, filename: snapshotFilename, created_at: new Date().toISOString(), type: 'pre_restore' }];
  await env.DB.prepare(
    `UPDATE restore_job
     SET snapshot_key=?, snapshot_filename=?, snapshot_status='DONE', snapshot_created_at=${sqlNowStored()}, restore_points_json=?, stage='SCAN', updated_at=${sqlNowStored()}
     WHERE id=?`
  ).bind(snapshotKey, snapshotFilename, JSON.stringify(restorePoints), jobId).run();
  return { snapshotKey, snapshotFilename };
}

function buildInsertSql(mode: RestoreMode, table: string, cols: string[]) {
  const placeholders = cols.map(() => '?').join(',');
  if (mode === 'merge') return `INSERT OR IGNORE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`;
  return `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`;
}

function summarizeRestoreVerification(verification: any) {
  const rowFailures = Array.isArray(verification?.row_checks) ? verification.row_checks.filter((item: any) => !item?.ok).length : 0;
  const integrityIssues = Number(verification?.integrity?.issue_count || 0);
  if (rowFailures <= 0 && integrityIssues <= 0) return null;
  const parts: string[] = [];
  if (rowFailures > 0) parts.push(`行数核对失败 ${rowFailures} 项`);
  if (integrityIssues > 0) parts.push(`数据一致性检查发现 ${integrityIssues} 项`);
  return `恢复后校验未完全通过：${parts.join('，')}`;
}

function getPlannedRowCount(perTable: any, table: string) {
  const n = Number(perTable?.[table] || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function hasRemainingRowsAfterCursor(order: string[], perTable: any, cursor: { table?: string; row?: number }) {
  const cursorTable = String(cursor?.table || '');
  const cursorRow = Math.max(0, Number(cursor?.row || 0));
  const cursorIndex = cursorTable ? order.indexOf(cursorTable) : -1;
  for (let i = 0; i < order.length; i += 1) {
    const table = order[i];
    const total = getPlannedRowCount(perTable, table);
    if (total <= 0) continue;
    if (cursorIndex >= 0) {
      if (i < cursorIndex) continue;
      if (i === cursorIndex) {
        if (cursorRow < total) return true;
        continue;
      }
    }
    return true;
  }
  return false;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isSupportedBackupVersion(version: string | null | undefined) {
  const value = String(version || '').trim();
  return value === BACKUP_VERSION || LEGACY_BACKUP_VERSIONS.includes(value as any);
}

function normalizeMetadataObject<T>(value: any): T | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as T : null;
}

async function scanBackupRowsForIntegrity(stream: ReadableStream<Uint8Array>, gzip: boolean | undefined, tableOrderHint: string[]) {
  const seenOrder: string[] = [];
  const seen = new Set<string>();
  const rowCounts: Record<string, number> = {};
  const rowChainStates: Record<string, Uint8Array | null> = {};
  const rowChainHexByTable: Record<string, string> = {};

  for await (const item of iterBackupRowsFromStream(stream, gzip)) {
    const table = String(item?.table || '');
    if (!table) continue;
    if (!seen.has(table)) {
      seen.add(table);
      seenOrder.push(table);
    }
    const rowText = String(item?.rowText || '{}');
    let canonicalRowText = '{}';
    try {
      canonicalRowText = JSON.stringify(JSON.parse(rowText));
    } catch {
      throw new Error(`Invalid backup row JSON in ${table}`);
    }
    rowCounts[table] = (rowCounts[table] || 0) + 1;
    rowChainStates[table] = await chainSha256(rowChainStates[table] || null, [canonicalRowText]);
  }

  for (const table of Object.keys(rowCounts)) {
    rowChainHexByTable[table] = bytesToHex(rowChainStates[table] || await chainSha256(null, ['']));
  }

  const tableOrder = tableOrderHint.length ? tableOrderHint : seenOrder;
  const tables: BackupIntegrity['tables'] = {};
  let tableChainState: Uint8Array | null = null;
  let totalRows = 0;
  for (const table of tableOrder) {
    const rows = Number(rowCounts[table] || 0);
    totalRows += rows;
    const rowChainHex = rowChainHexByTable[table] || bytesToHex(await chainSha256(null, ['']));
    tables[table] = { rows, row_chain_sha256: rowChainHex };
    tableChainState = await chainSha256(tableChainState, [table, ':', String(rows), ':', rowChainHex]);
  }

  return {
    tableOrder,
    rowCounts,
    rowChainHexByTable,
    integrityCore: {
      total_rows: totalRows,
      table_count: tableOrder.length,
      tables,
      table_chain_sha256: bytesToHex(tableChainState || await chainSha256(null, [''])),
    },
  };
}

async function buildIntegrityCoreForOrder(scan: Awaited<ReturnType<typeof scanBackupRowsForIntegrity>>, tableOrder: string[]) {
  const tables: BackupIntegrity['tables'] = {};
  let tableChainState: Uint8Array | null = null;
  let totalRows = 0;
  const emptyRowChain = bytesToHex(await chainSha256(null, ['']));

  for (const table of tableOrder) {
    const rows = Number(scan.rowCounts[table] || 0);
    totalRows += rows;
    const rowChainHex = scan.rowChainHexByTable[table] || emptyRowChain;
    tables[table] = { rows, row_chain_sha256: rowChainHex };
    tableChainState = await chainSha256(tableChainState, [table, ':', String(rows), ':', rowChainHex]);
  }

  return {
    total_rows: totalRows,
    table_count: tableOrder.length,
    tables,
    table_chain_sha256: bytesToHex(tableChainState || await chainSha256(null, [''])),
  };
}

async function scanBackupForValidationFromObject(obj: { body: ReadableStream<Uint8Array> }) {
  const [metadataBody, rowBody] = obj.body.tee();

  const metadataPromise = (async () => {
    const sniff = await sniffGzipFromStream(metadataBody);
    return readBackupEnvelopeMetadataFromStream(sniff.stream, sniff.gzip);
  })();

  const rowScanPromise = (async () => {
    const sniff = await sniffGzipFromStream(rowBody);
    return scanBackupRowsForIntegrity(sniff.stream, sniff.gzip, []);
  })();

  const [metadata, rowScan] = await Promise.all([metadataPromise, rowScanPromise]);
  return { metadata, rowScan };
}

async function validateScannedBackupEnvelope(metadata: Record<string, any>, scan: Awaited<ReturnType<typeof scanBackupRowsForIntegrity>>) {
  const issues: BackupValidationIssue[] = [];
  const version = String(metadata?.version || metadata?.meta?.backup_version || '').trim() || null;
  if (!version) {
    issues.push({ severity: 'error', type: 'backup_version_missing', message: 'Backup file is missing version' });
  } else if (!isSupportedBackupVersion(version)) {
    issues.push({ severity: 'error', type: 'backup_version_unsupported', message: `Unsupported backup version: ${version}` });
  }

  const manifest = normalizeMetadataObject<BackupManifest>(metadata?.manifest);
  const integrity = normalizeMetadataObject<BackupIntegrity>(metadata?.integrity);
  const tableOrder = Array.isArray(manifest?.table_order) && manifest.table_order.length ? manifest.table_order : scan.tableOrder;
  const actualRowCounts = Object.fromEntries(tableOrder.map((table) => [table, Number(scan.rowCounts[table] || 0)]));

  if (version === BACKUP_VERSION) {
    if (!manifest) issues.push({ severity: 'error', type: 'backup_manifest_missing', message: 'v3 backup is missing manifest' });
    if (!integrity) issues.push({ severity: 'error', type: 'backup_integrity_missing', message: 'v3 backup is missing integrity' });
  } else if (!manifest) {
    issues.push({ severity: 'info', type: 'legacy_manifest_missing', message: 'Legacy backup has no manifest; row hash validation will be limited' });
  }

  if (manifest) {
    if (!Array.isArray(manifest.table_order) || manifest.table_order.length === 0) {
      issues.push({ severity: 'error', type: 'manifest_table_order_invalid', message: 'manifest.table_order is invalid' });
    }
    for (const table of tableOrder) {
      const expected = Number(manifest.tables?.[table]?.rows || 0);
      const actual = Number(actualRowCounts[table] || 0);
      if (expected !== actual) {
        issues.push({ severity: 'error', type: 'manifest_row_count_mismatch', table, message: `Table ${table} manifest rows=${expected}, actual rows=${actual}` });
      }
    }
  }

  let recomputedIntegrity: BackupIntegrity | null = null;
  if (integrity) {
    recomputedIntegrity = {
      manifest_sha256: manifest ? await sha256JsonHex(manifest) : '',
      ...(await buildIntegrityCoreForOrder(scan, tableOrder)),
    };
    if (manifest && integrity.manifest_sha256 !== recomputedIntegrity.manifest_sha256) {
      issues.push({ severity: 'error', type: 'manifest_sha256_mismatch', message: 'manifest_sha256 validation failed' });
    }
    if (Number(integrity.total_rows || 0) !== Number(recomputedIntegrity.total_rows || 0)) {
      issues.push({ severity: 'error', type: 'integrity_total_rows_mismatch', message: `integrity.total_rows=${Number(integrity.total_rows || 0)}, actual=${Number(recomputedIntegrity.total_rows || 0)}` });
    }
    if (Number(integrity.table_count || 0) !== Number(recomputedIntegrity.table_count || 0)) {
      issues.push({ severity: 'error', type: 'integrity_table_count_mismatch', message: `integrity.table_count=${Number(integrity.table_count || 0)}, actual=${Number(recomputedIntegrity.table_count || 0)}` });
    }
    if (String(integrity.table_chain_sha256 || '') !== String(recomputedIntegrity.table_chain_sha256 || '')) {
      issues.push({ severity: 'error', type: 'table_chain_sha256_mismatch', message: 'table_chain_sha256 validation failed' });
    }
    for (const table of tableOrder) {
      const expected = integrity.tables?.[table];
      const actual = recomputedIntegrity.tables?.[table];
      if (!expected) {
        issues.push({ severity: 'error', type: 'integrity_table_missing', table, message: `integrity.tables is missing ${table}` });
        continue;
      }
      if (Number(expected.rows || 0) !== Number(actual?.rows || 0)) {
        issues.push({ severity: 'error', type: 'integrity_table_rows_mismatch', table, message: `Table ${table} integrity rows=${Number(expected.rows || 0)}, actual=${Number(actual?.rows || 0)}` });
      }
      if (String(expected.row_chain_sha256 || '') !== String(actual?.row_chain_sha256 || '')) {
        issues.push({ severity: 'error', type: 'integrity_table_sha256_mismatch', table, message: `Table ${table} row SHA-256 validation failed` });
      }
    }
  } else if (version && LEGACY_BACKUP_VERSIONS.includes(version as any)) {
    issues.push({ severity: 'info', type: 'legacy_integrity_missing', message: 'Legacy backup has no integrity block; SHA-256 validation is skipped' });
  }

  return {
    ok: issues.every((issue) => issue.severity !== 'error'),
    version,
    issues,
    manifest,
    integrity,
    tableOrder,
    actualRowCounts,
    recomputedIntegrity,
  };
}

export const onRequestPost = withErrorHandling<Env>(async ({ env, request, waitUntil }) => {
    const actor = await requireAuth(env, request, 'admin');
    const body: any = await request.json().catch(() => ({}));
    const jobId = String(body?.id || '').trim();
    const maxRows = Math.min(Math.max(Number(body?.max_rows || 800), 50), 5000);
    const maxMs = Math.min(Math.max(Number(body?.max_ms || 8000), 1000), 25000);
    if (!jobId) return apiFail('缺少 id', { status: 400, errorCode: 'RESTORE_JOB_ID_REQUIRED' });
    if (!env.BACKUP_BUCKET) return apiFail('未绑定 R2：BACKUP_BUCKET。请先在 Cloudflare 里绑定 R2 Bucket。', { status: 500, errorCode: 'BACKUP_BUCKET_NOT_BOUND' });

    const job = await env.DB.prepare(`SELECT * FROM restore_job WHERE id=?`).bind(jobId).first<any>();
    if (!job) return apiFail('任务不存在', { status: 404, errorCode: 'RESTORE_JOB_NOT_FOUND' });
    if (job.status === 'DONE') return json(true, { id: jobId, status: 'DONE', stage: job.stage, integrity_status: job.integrity_status || null, more: false });
    if (job.status === 'FAILED') return json(true, { id: jobId, status: 'FAILED', stage: job.stage, integrity_status: job.integrity_status || null, more: false, last_error: job.last_error || null });

    await env.DB.prepare(`UPDATE restore_job SET status='RUNNING', updated_at=${sqlNowStored()} WHERE id=?`).bind(jobId).run();

    if (job.stage === 'SNAPSHOT') {
      try {
        if (job.mode !== 'replace') {
          await env.DB.prepare(
            `UPDATE restore_job
             SET snapshot_status='SKIPPED', stage='SCAN', updated_at=${sqlNowStored()}
             WHERE id=?`
          ).bind(jobId).run();
          waitUntil(logAudit(env.DB, request, actor, 'ADMIN_RESTORE_JOB_SNAPSHOT_SKIPPED', 'restore_job', jobId, { mode: job.mode || 'merge' }).catch(() => {}));
          return json(true, { id: jobId, status: 'RUNNING', stage: 'SCAN', snapshot_status: 'SKIPPED', integrity_status: job.integrity_status || 'PENDING', more: true });
        }
        await env.DB.prepare(`UPDATE restore_job SET snapshot_status='RUNNING', updated_at=${sqlNowStored()} WHERE id=?`).bind(jobId).run();
        const snap = await createSnapshot(env, actor.username, jobId);
        waitUntil(logAudit(env.DB, request, actor, 'ADMIN_RESTORE_JOB_SNAPSHOT_DONE', 'restore_job', jobId, snap).catch(() => {}));
        return json(true, { id: jobId, status: 'RUNNING', stage: 'SCAN', snapshot_status: 'DONE', integrity_status: job.integrity_status || 'PENDING', more: true });
      } catch (e: any) {
        await env.DB.prepare(`UPDATE restore_job SET status='FAILED', snapshot_status='FAILED', integrity_status='FAILED', last_error=?, updated_at=${sqlNowStored()} WHERE id=?`).bind(String(e?.message || e), jobId).run();
        return apiFail(String(e?.message || e), { status: 500, errorCode: 'RESTORE_SNAPSHOT_FAILED' });
      }
    }

    const obj = await env.BACKUP_BUCKET.get(job.file_key);
    if (!obj?.body) {
      await env.DB.prepare(`UPDATE restore_job SET status='FAILED', integrity_status='FAILED', last_error=?, updated_at=${sqlNowStored()} WHERE id=?`).bind('R2 文件不存在或已被删除', jobId).run();
      return apiFail('R2 文件不存在或已被删除', { status: 500, errorCode: 'RESTORE_R2_FILE_MISSING' });
    }

    if (job.stage === 'SCAN') {
      const perTable: any = { __order__: Object.keys(TABLE_COLUMNS), __present__: {} as Record<string, boolean> };
      const counts: Record<string, number> = Object.fromEntries(Object.keys(TABLE_COLUMNS).map((t) => [t, 0]));
      let total = 0;

      const { metadata, rowScan } = await scanBackupForValidationFromObject(obj);
      const validation = await validateScannedBackupEnvelope(metadata, rowScan);
      const validationJson = {
        ok: validation.ok,
        version: validation.version,
        issues: validation.issues,
        manifest: validation.manifest,
        integrity: validation.integrity,
        recomputed_integrity: validation.recomputedIntegrity,
        actual_row_counts: validation.actualRowCounts,
      };
        if (!validation.ok) {
          const message = validation.issues.filter((item) => item.severity === 'error').map((item) => item.message).join('；') || '备份校验失败';
          await env.DB.prepare(`UPDATE restore_job SET status='FAILED', integrity_status='FAILED', backup_version=?, validation_json=?, last_error=?, updated_at=${sqlNowStored()} WHERE id=?`)
            .bind(validation.version || null, JSON.stringify(validationJson), message, jobId).run();
          waitUntil(logAudit(env.DB, request, actor, 'ADMIN_RESTORE_JOB_VALIDATE_FAILED', 'restore_job', jobId, validationJson).catch(() => {}));
          return apiFail(message, { status: 400, errorCode: 'BACKUP_VALIDATE_FAILED' });
        }

      for (const t of rowScan.tableOrder) {
        if (!TABLE_COLUMNS[t]) continue;
        perTable.__present__[t] = true;
      }
      for (const [t, rowCount] of Object.entries(rowScan.rowCounts)) {
        if (!TABLE_COLUMNS[t]) continue;
        perTable.__present__[t] = true;
        const n = Number(rowCount || 0);
        counts[t] = n;
        total += n;
      }
      for (const t of Object.keys(TABLE_COLUMNS)) perTable[t] = counts[t] || 0;
      const order: string[] = perTable.__order__;
      const cursor = order.length ? { table: order[0], row: 0 } : { table: '', row: 0 };
      await env.DB.prepare(`UPDATE restore_job SET stage='RESTORE', total_rows=?, per_table_json=?, cursor_json=?, current_table=?, backup_version=?, validation_json=?, integrity_status='VALIDATED', updated_at=${sqlNowStored()} WHERE id=?`)
        .bind(total, JSON.stringify(perTable), JSON.stringify(cursor), cursor.table || null, validation.version || null, JSON.stringify(validationJson), jobId).run();
      waitUntil(logAudit(env.DB, request, actor, 'ADMIN_RESTORE_JOB_SCAN_DONE', 'restore_job', jobId, { total_rows: total, validation_ok: true, backup_version: validation.version || null }).catch(() => {}));
      return json(true, { id: jobId, status: 'RUNNING', stage: 'RESTORE', total_rows: total, processed_rows: Number(job.processed_rows || 0), integrity_status: 'VALIDATED', more: true });
    }

    const mode = ((job.mode as RestoreMode) || 'merge');
    if (mode === 'replace' && Number(job.replaced_done || 0) === 0) {
      const stmts = DELETE_ORDER.map((t) => env.DB.prepare(`DELETE FROM ${t}`));
      await env.DB.batch(stmts);
      await env.DB.prepare(`UPDATE restore_job SET replaced_done=1, updated_at=${sqlNowStored()} WHERE id=?`).bind(jobId).run();
    }

    const cursor = parseJsonSafe(job.cursor_json || '{}', { table: '', row: 0 });
    const perTable = parseJsonSafe(job.per_table_json || '{}', { __order__: [] as string[], __present__: {} as Record<string, boolean>, __processed__: {} as Record<string, number>, __inserted__: {} as Record<string, number> });
    const validationJson = parseJsonSafe(job.validation_json || '{}', {} as any);
    const order: string[] = Array.isArray(perTable.__order__) ? perTable.__order__ : [];
    const restorableOrder = order.filter((t) => !!TABLE_COLUMNS[t] && t !== 'restore_job');
    const cursorTable = String(cursor.table || '');
    const cursorRow = Number(cursor.row || 0);
    const cursorTableIndex = cursorTable ? restorableOrder.indexOf(cursorTable) : -1;

    let processedThisRun = 0;
    const processedByTable: Record<string, number> = {};
    const insertedByTable: Record<string, number> = {};
    let lastTable = cursorTable;
    let lastNextRow = cursorRow;
    const startTime = Date.now();
    const restoreBatchSize = 200;
    const cancelCheckInterval = 1000;

    const runObj = await env.BACKUP_BUCKET.get(job.file_key);
    if (!runObj?.body) throw new Error('R2 文件读取失败（RESTORE）');

    try {
      let curTableIndex = -1;
      let rowIndexInTable = -1;
      let cols: string[] | null = null;
      let sql = '';
      let batch: D1PreparedStatement[] = [];
      let batchTable = '';
      let batchRows = 0;

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
      const seenByTable: Record<string, number> = {};
      outer:
      for await (const item of iterBackupRowsFromStream(sniff2.stream, sniff2.gzip)) {
        const table = String(item?.table || '');
        if (!TABLE_COLUMNS[table] || table === 'restore_job') continue;
        curTableIndex = restorableOrder.indexOf(table);
        if (curTableIndex < 0) continue;

        rowIndexInTable = seenByTable[table] || 0;
        seenByTable[table] = rowIndexInTable + 1;
        if (cursorTableIndex >= 0) {
          if (curTableIndex < cursorTableIndex) continue;
          if (curTableIndex === cursorTableIndex && rowIndexInTable < cursorRow) continue;
        }

        if (batch.length && batchTable && batchTable !== table) await flush();
        cols = TABLE_COLUMNS[table];
        sql = buildInsertSql(mode, table, cols);
        batchTable = table;

        if ((processedThisRun % cancelCheckInterval) === 0) {
          const s = await env.DB.prepare(`SELECT status FROM restore_job WHERE id=?`).bind(jobId).first<any>();
          if (s?.status === 'PAUSED' || s?.status === 'CANCELED') {
            await flush();
            return json(true, { id: jobId, status: s.status, integrity_status: job.integrity_status || 'VALIDATED', more: false });
          }
        }
        let objRow: Record<string, any>;
        try {
          objRow = JSON.parse(String(item?.rowText || '{}'));
        } catch {
          throw new Error(`Invalid backup row JSON in ${table} at row ${rowIndexInTable + 1}`);
        }
        batch.push(env.DB.prepare(sql).bind(...pick(objRow, cols!)));
        batchRows += 1;
        processedThisRun += 1;
        lastTable = table;
        lastNextRow = rowIndexInTable + 1;
        if (batch.length >= restoreBatchSize) await flush();
        if (processedThisRun >= maxRows) break outer;
        if (Date.now() - startTime >= maxMs) break outer;
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

      const hitBudgetLimit = processedThisRun >= maxRows || (Date.now() - startTime) >= maxMs;
      const hasMoreRows = hasRemainingRowsAfterCursor(restorableOrder, perTable, nextCursor);
      const done = !hasMoreRows && !hitBudgetLimit && Number(job.error_count || 0) === 0 && (totalRows > 0 ? processedRowsNew >= totalRows : true);
      const currentTableForSave = done ? null : (nextCursor.table || null);
      const cursorForSave = done ? { table: '', row: 0 } : nextCursor;

      await env.DB.prepare(`UPDATE restore_job SET processed_rows=?, current_table=?, cursor_json=?, per_table_json=?, updated_at=${sqlNowStored()} WHERE id=?`)
        .bind(processedRowsNew, currentTableForSave, JSON.stringify(cursorForSave), JSON.stringify(perTable), jobId).run();

      let integrityStatus = job.integrity_status || 'VALIDATED';
      if (done) {
        await finalizeRestoreState(env.DB);
        const verification = await buildRestoreVerification(env.DB, {
          mode,
          manifest: validationJson?.manifest || null,
          tableOrder: restorableOrder,
          processedRows: processedRowsNew,
          totalRows,
        }, { integrityMode: 'quick' });
        integrityStatus = verification.ok ? 'OK' : 'WARN';
        const verificationSummary = summarizeRestoreVerification(verification);
        await env.DB.prepare(`UPDATE restore_job SET status='DONE', integrity_status=?, verification_json=?, completed_at=${sqlNowStored()}, current_table=NULL, cursor_json='{"table":"","row":0}', updated_at=${sqlNowStored()}, last_error=COALESCE(last_error, ?) WHERE id=?`)
          .bind(integrityStatus, JSON.stringify(verification), verificationSummary, jobId).run();
        waitUntil(logAudit(env.DB, request, actor, 'ADMIN_RESTORE_JOB_DONE', 'restore_job', jobId, {
          processed_rows: processedRowsNew,
          total_rows: totalRows,
          integrity_status: integrityStatus,
          verification_ok: verification.ok,
          integrity_issue_count: Number(verification?.integrity?.issue_count || 0),
        }).catch(() => {}));
      }

      return json(true, {
        id: jobId,
        status: done ? 'DONE' : 'RUNNING',
        stage: 'RESTORE',
        processed_delta: processedThisRun,
        processed_rows: processedRowsNew,
        total_rows: totalRows,
        current_table: currentTableForSave,
        per_table: perTable,
        cursor: cursorForSave,
        snapshot_status: job.snapshot_status || null,
        integrity_status: integrityStatus,
        more: !done,
      });
    } catch (e: any) {
      await env.DB.prepare(`UPDATE restore_job SET status='FAILED', integrity_status='FAILED', error_count=error_count+1, last_error=?, updated_at=${sqlNowStored()} WHERE id=?`).bind(String(e?.message || e), jobId).run();
      return apiFail(String(e?.message || e), { status: 500, errorCode: 'RESTORE_RUN_FAILED' });
    }
});
