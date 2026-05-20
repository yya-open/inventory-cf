import {
  latestPcOutRowSql,
  monitorAssetArchiveSql,
  monitorAssetBulkLocationSql,
  monitorAssetBulkOwnerSql,
  monitorAssetBulkStatusSql,
  monitorAssetRestoreSql,
  pcAssetArchiveSql,
  pcAssetBulkOwnerSql,
  pcAssetBulkStatusSql,
  pcAssetRestoreSql,
  buildMonitorAssetSearchText,
} from './asset-ledger';
import { ensurePcLatestStateTable } from './pc-latest-state';
import { type AssetArchiveKind } from './asset-archive';
import { sqlNowStored } from '../_time';
import { pcOutNo } from '../_pc';
import { monitorTxNo } from '../_monitor';

const DEFAULT_BATCH_SIZE = 100;

type AssetRow = Record<string, any> & { id: number; status?: string | null; archived?: number | null };

type AssetTable = 'pc_assets' | 'monitor_assets';

type LoadAssetOptions = {
  archived?: 0 | 1;
  statuses?: string[];
};

type BulkUpdateSummary = {
  changed: number;
  skipped: number;
  ids: number[];
  skippedIds: number[];
};

type BulkPcOwnerSummary = BulkUpdateSummary & {
  latestOutIds: number[];
};

type BulkOwnerWriteOptions = {
  createdBy?: string | null;
  ip?: string | null;
  ua?: string | null;
};

function uniquePositiveIds(ids: number[]) {
  return Array.from(new Set((ids || []).map((id) => Number(id || 0)).filter((id) => id > 0)));
}

function tableOf(kind: AssetArchiveKind): AssetTable {
  return kind === 'pc' ? 'pc_assets' : 'monitor_assets';
}

async function runBatchStatements(db: D1Database, statements: D1PreparedStatement[], batchSize = DEFAULT_BATCH_SIZE) {
  for (let index = 0; index < statements.length; index += batchSize) {
    const chunk = statements.slice(index, index + batchSize);
    if (chunk.length) await db.batch(chunk);
  }
}

export async function loadAssetRows(
  db: D1Database,
  kind: AssetArchiveKind,
  ids: number[],
  options: LoadAssetOptions = {},
): Promise<AssetRow[]> {
  const validIds = uniquePositiveIds(ids);
  if (!validIds.length) return [];
  const clauses = [`id IN (${validIds.map(() => '?').join(',')})`];
  const binds: any[] = [...validIds];
  if (options.archived === 0 || options.archived === 1) {
    clauses.push('COALESCE(archived, 0)=?');
    binds.push(options.archived);
  }
  const statuses = (options.statuses || []).map((status) => String(status || '').trim()).filter(Boolean);
  if (statuses.length) {
    clauses.push(`status IN (${statuses.map(() => '?').join(',')})`);
    binds.push(...statuses);
  }
  const sql = `SELECT * FROM ${tableOf(kind)} WHERE ${clauses.join(' AND ')} ORDER BY id ASC`;
  const { results } = await db.prepare(sql).bind(...binds).all<any>();
  return (results || []).map((row: any) => ({
    ...(row || {}),
    id: Number(row?.id || 0),
    status: row?.status || null,
    archived: Number(row?.archived || 0),
  }));
}

export async function bulkArchiveAssets(
  db: D1Database,
  kind: AssetArchiveKind,
  ids: number[],
  reason: string,
  note: string | null,
  updatedBy: string | null,
): Promise<BulkUpdateSummary> {
  const rows = await loadAssetRows(db, kind, ids);
  const targetIds = rows.map((row) => row.id);
  const skippedIds = uniquePositiveIds(ids).filter((id) => !targetIds.includes(id));
  const sql = kind === 'pc' ? pcAssetArchiveSql() : monitorAssetArchiveSql();
  const statements = targetIds.map((id) => db.prepare(sql).bind(reason, note, updatedBy || null, id));
  await runBatchStatements(db, statements);
  return { changed: targetIds.length, skipped: skippedIds.length, ids: targetIds, skippedIds };
}

export async function bulkRestoreAssets(
  db: D1Database,
  kind: AssetArchiveKind,
  ids: number[],
): Promise<BulkUpdateSummary> {
  const rows = await loadAssetRows(db, kind, ids, { archived: 1 });
  const targetIds = rows.map((row) => row.id);
  const skippedIds = uniquePositiveIds(ids).filter((id) => !targetIds.includes(id));
  const sql = kind === 'pc' ? pcAssetRestoreSql() : monitorAssetRestoreSql();
  const statements = targetIds.map((id) => db.prepare(sql).bind(id));
  await runBatchStatements(db, statements);
  return { changed: targetIds.length, skipped: skippedIds.length, ids: targetIds, skippedIds };
}

export async function bulkUpdatePcStatus(
  db: D1Database,
  ids: number[],
  status: string,
): Promise<BulkUpdateSummary> {
  const rows = await loadAssetRows(db, 'pc', ids, { archived: 0 });
  const targetIds = rows.map((row) => row.id);
  const skippedIds = uniquePositiveIds(ids).filter((id) => !targetIds.includes(id));
  const statements = targetIds.map((id) => db.prepare(pcAssetBulkStatusSql()).bind(status, id));
  await runBatchStatements(db, statements);
  if (targetIds.length && status !== 'ASSIGNED') {
    const clearStatements = targetIds.map((id) => db.prepare(`UPDATE pc_asset_latest_state SET current_employee_no=NULL, current_employee_name=NULL, current_department=NULL, updated_at=datetime('now','+8 hours') WHERE asset_id=?`).bind(id));
    await runBatchStatements(db, clearStatements);
  }
  return { changed: targetIds.length, skipped: skippedIds.length, ids: targetIds, skippedIds };
}

export async function bulkUpdateMonitorStatus(
  db: D1Database,
  ids: number[],
  status: string,
): Promise<BulkUpdateSummary> {
  const rows = await loadAssetRows(db, 'monitor', ids, { archived: 0 });
  const targetIds = rows.map((row) => row.id);
  const skippedIds = uniquePositiveIds(ids).filter((id) => !targetIds.includes(id));
  const rowsById = new Map(rows.map((row: any) => [row.id, row]));
  const statements = targetIds.map((id) => {
    const row: any = rowsById.get(id) || {};
    return db.prepare(
      `UPDATE monitor_assets
       SET status=?,
           employee_no=CASE WHEN ?='ASSIGNED' THEN employee_no ELSE NULL END,
           department=CASE WHEN ?='ASSIGNED' THEN department ELSE NULL END,
           employee_name=CASE WHEN ?='ASSIGNED' THEN employee_name ELSE NULL END,
           is_employed=CASE WHEN ?='ASSIGNED' THEN is_employed ELSE NULL END,
           search_text_norm=?,
           updated_at=datetime('now','+8 hours')
       WHERE id=?`
    ).bind(
      status,
      status,
      status,
      status,
      status,
      buildMonitorAssetSearchText(row, status === 'ASSIGNED' ? { employee_no: row.employee_no, employee_name: row.employee_name, department: row.department } : {}),
      id,
    );
  });
  await runBatchStatements(db, statements);
  return { changed: targetIds.length, skipped: skippedIds.length, ids: targetIds, skippedIds };
}

export async function bulkUpdateMonitorLocation(
  db: D1Database,
  ids: number[],
  locationId: number | null,
): Promise<BulkUpdateSummary> {
  const rows = await loadAssetRows(db, 'monitor', ids, { archived: 0 });
  const targetIds = rows.map((row) => row.id);
  const skippedIds = uniquePositiveIds(ids).filter((id) => !targetIds.includes(id));
  const rowsById = new Map(rows.map((row: any) => [row.id, row]));
  const statements = targetIds.map((id) => { const row: any = rowsById.get(id) || {}; return db.prepare(`UPDATE monitor_assets SET location_id=?, search_text_norm=?, updated_at=datetime('now','+8 hours') WHERE id=?`).bind(locationId, buildMonitorAssetSearchText(row, { employee_no: row.employee_no, employee_name: row.employee_name, department: row.department }), id); });
  await runBatchStatements(db, statements);
  return { changed: targetIds.length, skipped: skippedIds.length, ids: targetIds, skippedIds };
}

export async function bulkUpdateMonitorOwner(
  db: D1Database,
  ids: number[],
  owner: { employee_no: string | null; department: string | null; employee_name: string },
  options: BulkOwnerWriteOptions = {},
): Promise<BulkUpdateSummary> {
  const rows = await loadAssetRows(db, 'monitor', ids, { archived: 0 });
  const targetIds = rows
    .filter((row: any) => {
      const department = owner.department ?? row.department ?? null;
      if (String(row.status || '') !== 'ASSIGNED') return true;
      return String(row.employee_no || '').trim() !== String(owner.employee_no || '').trim()
        || String(row.employee_name || '').trim() !== String(owner.employee_name || '').trim()
        || String(row.department || '').trim() !== String(department || '').trim();
    })
    .map((row) => row.id);
  const skippedIds = uniquePositiveIds(ids).filter((id) => !targetIds.includes(id));
  const rowsById = new Map(rows.map((row: any) => [row.id, row]));
  const statements = targetIds.flatMap((id) => {
    const row: any = rowsById.get(id) || {};
    const department = owner.department ?? row.department ?? null;
    return [
      db.prepare(
        `INSERT INTO monitor_tx
          (tx_no, tx_type, asset_id, asset_code, sn, brand, model, size_inch, from_location_id, to_location_id,
           employee_no, department, employee_name, is_employed, remark, created_by, ip, ua)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        monitorTxNo('MONOW'),
        'OUT',
        id,
        row.asset_code ?? null,
        row.sn ?? null,
        row.brand ?? null,
        row.model ?? null,
        row.size_inch ?? null,
        row.location_id ?? null,
        row.location_id ?? null,
        owner.employee_no,
        department,
        owner.employee_name,
        'Y',
        null,
        options.createdBy || null,
        options.ip || '',
        options.ua || '',
      ),
      db.prepare(`UPDATE monitor_assets SET status='ASSIGNED', employee_no=?, department=COALESCE(?, department), employee_name=?, is_employed='Y', search_text_norm=?, updated_at=datetime('now','+8 hours') WHERE id=?`).bind(owner.employee_no, owner.department, owner.employee_name, buildMonitorAssetSearchText(row, { employee_no: owner.employee_no, employee_name: owner.employee_name, department }), id),
    ];
  });
  await runBatchStatements(db, statements);
  return { changed: targetIds.length, skipped: skippedIds.length, ids: targetIds, skippedIds };
}

export async function bulkUpdatePcOwner(
  db: D1Database,
  ids: number[],
  owner: { employee_no: string | null; department: string | null; employee_name: string },
  options: BulkOwnerWriteOptions = {},
): Promise<BulkPcOwnerSummary> {
  const rows = await loadAssetRows(db, 'pc', ids, { archived: 0, statuses: ['ASSIGNED'] });
  const targetIds = rows.map((row) => row.id);
  const skippedIds = uniquePositiveIds(ids).filter((id) => !targetIds.includes(id));
  if (!targetIds.length) return { changed: 0, skipped: skippedIds.length, ids: [], skippedIds, latestOutIds: [] };

  const { results } = await db.prepare(
    `SELECT x.asset_id, x.max_id AS out_id,
            o.employee_no, o.employee_name, o.department, o.is_employed,
            a.brand, a.serial_no, a.model, a.manufacture_date, a.warranty_end, a.disk_capacity, a.memory_size
     FROM (
       SELECT asset_id, MAX(id) AS max_id
       FROM pc_out
       WHERE asset_id IN (${targetIds.map(() => '?').join(',')})
       GROUP BY asset_id
     ) x
     JOIN pc_out o ON o.id = x.max_id
     JOIN pc_assets a ON a.id = x.asset_id`
  ).bind(...targetIds).all<any>();
  const latestOutIds = (results || []).map((row: any) => Number(row?.out_id || 0)).filter((id: number) => id > 0);
  const latestOutByAsset = new Map<number, number>((results || []).map((row: any) => [Number(row?.asset_id || 0), Number(row?.out_id || 0)]));
  const latestByAsset = new Map<number, any>((results || []).map((row: any) => [Number(row?.asset_id || 0), row]));
  const effectiveIds = targetIds.filter((id) => {
    const latest = latestByAsset.get(id);
    if (!latest || Number(latestOutByAsset.get(id) || 0) <= 0) return false;
    const department = owner.department ?? latest.department ?? null;
    return String(latest.employee_no || '').trim() !== String(owner.employee_no || '').trim()
      || String(latest.employee_name || '').trim() !== String(owner.employee_name || '').trim()
      || String(latest.department || '').trim() !== String(department || '').trim();
  });
  const extraSkippedIds = targetIds.filter((id) => !effectiveIds.includes(id));
  const outNoByAsset = new Map<number, string>(effectiveIds.map((assetId) => [assetId, pcOutNo()]));
  const statements = effectiveIds.flatMap((assetId) => {
    const latest = latestByAsset.get(assetId) || {};
    const outNo = outNoByAsset.get(assetId) || pcOutNo();
    const department = owner.department ?? latest.department ?? null;
    return [
      db.prepare(
        `INSERT INTO pc_out (
          out_no, asset_id,
          employee_no, department, employee_name, is_employed,
          brand, serial_no, model,
          config_date, manufacture_date, warranty_end, disk_capacity, memory_size,
          remark, created_by, created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ${sqlNowStored()})`
      ).bind(
        outNo,
        assetId,
        owner.employee_no,
        department,
        owner.employee_name,
        latest.is_employed ?? null,
        latest.brand ?? null,
        latest.serial_no ?? null,
        latest.model ?? null,
        null,
        latest.manufacture_date ?? null,
        latest.warranty_end ?? null,
        latest.disk_capacity ?? null,
        latest.memory_size ?? null,
        null,
        options.createdBy || null,
      ),
      db.prepare(`UPDATE pc_assets SET status='ASSIGNED', updated_at=${sqlNowStored()} WHERE id=?`).bind(assetId),
    ];
  });
  await runBatchStatements(db, statements);
  await ensurePcLatestStateTable(db);
  const latestStateStmts = effectiveIds.map((assetId) =>
    db.prepare(
      `INSERT INTO pc_asset_latest_state (
        asset_id, last_out_id, last_in_id, last_recycle_id,
        current_employee_no, current_employee_name, current_department,
        last_config_date, last_out_at, last_in_at, last_recycle_date, updated_at
      ) VALUES (?, (SELECT id FROM pc_out WHERE out_no=? LIMIT 1), NULL, NULL, ?, ?, ?, NULL, ${sqlNowStored()}, NULL, NULL, ${sqlNowStored()})
      ON CONFLICT(asset_id) DO UPDATE SET
        current_employee_no=excluded.current_employee_no,
        current_employee_name=excluded.current_employee_name,
        current_department=excluded.current_department,
        last_out_id=excluded.last_out_id,
        last_out_at=${sqlNowStored()},
        last_recycle_id=NULL,
        last_recycle_date=NULL,
        updated_at=${sqlNowStored()}`
    ).bind(assetId, outNoByAsset.get(assetId) || '', owner.employee_no, owner.employee_name, owner.department ?? latestByAsset.get(assetId)?.department ?? null)
  );
  await runBatchStatements(db, latestStateStmts);
  return {
    changed: effectiveIds.length,
    skipped: skippedIds.length + extraSkippedIds.length,
    ids: effectiveIds,
    skippedIds: [...skippedIds, ...extraSkippedIds],
    latestOutIds,
  };
}
