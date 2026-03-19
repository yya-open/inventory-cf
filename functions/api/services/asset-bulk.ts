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
} from './asset-ledger';
import { type AssetArchiveKind } from './asset-archive';

const DEFAULT_BATCH_SIZE = 100;

type AssetRow = { id: number; status?: string | null; archived?: number | null };

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
  const sql = `SELECT id, status, archived FROM ${tableOf(kind)} WHERE ${clauses.join(' AND ')} ORDER BY id ASC`;
  const { results } = await db.prepare(sql).bind(...binds).all<any>();
  return (results || []).map((row: any) => ({
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
  const statements = targetIds.map((id) => db.prepare(monitorAssetBulkStatusSql()).bind(status, status, status, status, status, id));
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
  const statements = targetIds.map((id) => db.prepare(monitorAssetBulkLocationSql()).bind(locationId, id));
  await runBatchStatements(db, statements);
  return { changed: targetIds.length, skipped: skippedIds.length, ids: targetIds, skippedIds };
}

export async function bulkUpdateMonitorOwner(
  db: D1Database,
  ids: number[],
  owner: { employee_no: string | null; department: string | null; employee_name: string },
): Promise<BulkUpdateSummary> {
  const rows = await loadAssetRows(db, 'monitor', ids, { archived: 0 });
  const targetIds = rows.map((row) => row.id);
  const skippedIds = uniquePositiveIds(ids).filter((id) => !targetIds.includes(id));
  const statements = targetIds.map((id) => db.prepare(monitorAssetBulkOwnerSql()).bind(owner.employee_no, owner.department, owner.employee_name, id));
  await runBatchStatements(db, statements);
  return { changed: targetIds.length, skipped: skippedIds.length, ids: targetIds, skippedIds };
}

export async function bulkUpdatePcOwner(
  db: D1Database,
  ids: number[],
  owner: { employee_no: string | null; department: string | null; employee_name: string },
): Promise<BulkPcOwnerSummary> {
  const rows = await loadAssetRows(db, 'pc', ids, { archived: 0, statuses: ['ASSIGNED'] });
  const targetIds = rows.map((row) => row.id);
  const skippedIds = uniquePositiveIds(ids).filter((id) => !targetIds.includes(id));
  if (!targetIds.length) return { changed: 0, skipped: skippedIds.length, ids: [], skippedIds, latestOutIds: [] };

  const { results } = await db.prepare(
    `SELECT x.asset_id, x.max_id AS out_id
     FROM (
       SELECT asset_id, MAX(id) AS max_id
       FROM pc_out
       WHERE asset_id IN (${targetIds.map(() => '?').join(',')})
       GROUP BY asset_id
     ) x`
  ).bind(...targetIds).all<any>();
  const latestOutIds = (results || []).map((row: any) => Number(row?.out_id || 0)).filter((id: number) => id > 0);
  const latestOutByAsset = new Map<number, number>((results || []).map((row: any) => [Number(row?.asset_id || 0), Number(row?.out_id || 0)]));
  const effectiveIds = targetIds.filter((id) => Number(latestOutByAsset.get(id) || 0) > 0);
  const extraSkippedIds = targetIds.filter((id) => !effectiveIds.includes(id));
  const statements = effectiveIds.map((assetId) => db.prepare(pcAssetBulkOwnerSql()).bind(owner.employee_no, owner.department, owner.employee_name, Number(latestOutByAsset.get(assetId) || 0)));
  await runBatchStatements(db, statements);
  return {
    changed: effectiveIds.length,
    skipped: skippedIds.length + extraSkippedIds.length,
    ids: effectiveIds,
    skippedIds: [...skippedIds, ...extraSkippedIds],
    latestOutIds,
  };
}
