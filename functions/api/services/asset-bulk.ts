import {
  latestPcOutRowSql,
  monitorAssetArchiveSql,
  monitorAssetBulkLocationSql,
  monitorAssetBulkOwnerSql,
  monitorAssetBulkStatusSql,
  monitorAssetRestoreSql,
  pcAssetArchiveSql,
  pcAssetBulkOwnerSql,
  pcAssetRestoreSql,
  buildMonitorAssetSearchText,
} from './asset-ledger';
import { ensurePcLatestStateTable } from './pc-latest-state';
import { buildPcAssetRecalcStatements, pcEventCreatedAtAfterLatest } from '../pc-tx/_recalc';
import { type AssetArchiveKind } from './asset-archive';
import { sqlNowStored } from '../_time';
import { pcOutNo, pcRecycleNo, pcScrapNo } from '../_pc';
import { monitorTxNo } from '../_monitor';
import { guardRowCountSql, runBatchWithGuard } from '../_write';

const DEFAULT_BATCH_SIZE = 100;

/**
 * 目标状态 -> 用来证明这个状态的台账事件。
 * 键集合必须与 pc-assets-bulk.ts 的 ALLOWED_STATUS 一致（IN_STOCK / RECYCLED / SCRAPPED）；
 * ASSIGNED 不在其中——它需要领用人信息，走 bulkUpdatePcOwner。
 */
const PC_STATUS_EVENT: Record<string, { table: 'pc_recycle' | 'pc_scrap'; noColumn: string; action: string | null }> = {
  IN_STOCK: { table: 'pc_recycle', noColumn: 'recycle_no', action: 'RETURN' },
  RECYCLED: { table: 'pc_recycle', noColumn: 'recycle_no', action: 'RECYCLE' },
  SCRAPPED: { table: 'pc_scrap', noColumn: 'scrap_no', action: null },
};

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

type BulkStatusWriteOptions = {
  createdBy?: string | null;
  remark?: string | null;
};

function uniquePositiveIds(ids: number[]) {
  return Array.from(new Set((ids || []).map((id) => Number(id || 0)).filter((id) => id > 0)));
}

function missingRequestedIds(requestedIds: number[], targetIds: number[]) {
  const targetSet = new Set(targetIds);
  return uniquePositiveIds(requestedIds).filter((id) => !targetSet.has(id));
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
    clauses.push('archived=?');
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
  const skippedIds = missingRequestedIds(ids, targetIds);
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
  const skippedIds = missingRequestedIds(ids, targetIds);
  const sql = kind === 'pc' ? pcAssetRestoreSql() : monitorAssetRestoreSql();
  const statements = targetIds.map((id) => db.prepare(sql).bind(id));
  await runBatchStatements(db, statements);
  return { changed: targetIds.length, skipped: skippedIds.length, ids: targetIds, skippedIds };
}

/**
 * 批量改状态：必须写入一条与目标状态对应的台账事件，而不是直接 UPDATE pc_assets.status。
 *
 * 背景（本轮修复的核心）：这里过去只发 `UPDATE pc_assets SET status=?`，不写任何事件。
 * 而 pc-tx/_recalc.ts 把 status 定义为「最新一条 pc_in/pc_out/pc_recycle/pc_scrap 事件」的
 * 纯函数，admin/_restore_finalize.ts 又会在任何一次恢复完成后把每一行资产都重算一遍
 * （pc-tx/delete.ts 也会重算它碰到的资产）。于是本操作写下的状态不只是「与重算不一致」，
 * 而是**不持久**：下一次重算会把它按台账重新推回去，管理员的动作静默蒸发。
 *
 * 修法沿用姊妹函数 bulkUpdatePcOwner 已有的做法——补一条事件，让重算能复现同一个状态：
 *   IN_STOCK  -> pc_recycle(action='RETURN')
 *   RECYCLED  -> pc_recycle(action='RECYCLE')
 *   SCRAPPED  -> pc_scrap
 * 状态本身不再由本函数直接写，改由 buildPcAssetRecalcStatements 在同一批次内从台账推导，
 * 派生表 pc_asset_latest_state 也在同一批次重建（employee_* 的清空由重建 SQL 的
 * `CASE WHEN a.status='ASSIGNED'` 负责，不需要再单独发清空语句）。
 *
 * 事件行里的领用人快照走 `ORDER BY created_at DESC, id DESC` 的最新 pc_out，与
 * services/pc-latest-state.ts 的口径一致（历史实现用 `HAVING id = MAX(id)`，在
 * created_at 与 id 次序不一致时会取到另一行）。
 */
export async function bulkUpdatePcStatus(
  db: D1Database,
  ids: number[],
  status: string,
  options: BulkStatusWriteOptions = {},
): Promise<BulkUpdateSummary> {
  const rows = await loadAssetRows(db, 'pc', ids, { archived: 0 });
  const targetIds = rows.map((row) => row.id);
  const skippedIds = missingRequestedIds(ids, targetIds);
  if (!targetIds.length) return { changed: 0, skipped: skippedIds.length, ids: [], skippedIds };

  const event = PC_STATUS_EVENT[status];
  if (!event) throw Object.assign(new Error('不支持的目标状态'), { status: 400 });
  const createdBy = options.createdBy || null;
  const remark = options.remark ?? null;

  // 建表是 DDL，不能进事务批次
  await ensurePcLatestStateTable(db);

  const noByAsset = new Map<number, string>(targetIds.map((id) => [id, event.table === 'pc_scrap' ? pcScrapNo() : pcRecycleNo()]));
  const stmts: D1PreparedStatement[] = [];
  for (const assetId of targetIds) {
    const no = noByAsset.get(assetId) as string;
    stmts.push(
      event.table === 'pc_scrap'
        ? db.prepare(
            `INSERT INTO pc_scrap (
               scrap_no, asset_id,
               brand, serial_no, model,
               manufacture_date, warranty_end, disk_capacity, memory_size, remark,
               scrap_date, reason, created_by, created_at
             )
             SELECT ?, a.id,
                    a.brand, a.serial_no, a.model,
                    a.manufacture_date, a.warranty_end, a.disk_capacity, a.memory_size, ?,
                    date('now','+8 hours'), ?, ?, ${pcEventCreatedAtAfterLatest('a.id')}
               FROM pc_assets a
              WHERE a.id=? AND a.archived=0`
          ).bind(no, remark, remark, createdBy, assetId)
        : db.prepare(
            `INSERT INTO pc_recycle (
               recycle_no, action, asset_id,
               employee_no, department, employee_name, is_employed,
               brand, serial_no, model,
               recycle_date, remark, created_by, created_at
             )
             SELECT ?, ?, a.id,
                    lo.employee_no, lo.department, lo.employee_name, lo.is_employed,
                    a.brand, a.serial_no, a.model,
                    date('now','+8 hours'), ?, ?, ${pcEventCreatedAtAfterLatest('a.id')}
               FROM pc_assets a
               LEFT JOIN pc_out lo ON lo.id = (
                 SELECT id FROM pc_out WHERE asset_id = a.id ORDER BY created_at DESC, id DESC LIMIT 1
               )
              WHERE a.id=? AND a.archived=0`
          ).bind(no, event.action, remark, createdBy, assetId)
    );
  }
  // 状态与派生表都从台账推导，保证与 recalc 的定义一致
  stmts.push(...buildPcAssetRecalcStatements(db, targetIds));
  // 守卫行：每个资产都必须恰好留下一条事件，否则整批回滚
  stmts.push(
    db.prepare(guardRowCountSql(event.table, event.noColumn, targetIds.length))
      .bind(...targetIds.map((id) => noByAsset.get(id) as string), targetIds.length)
  );

  await runBatchWithGuard(db, stmts);
  return { changed: targetIds.length, skipped: skippedIds.length, ids: targetIds, skippedIds };
}

export async function bulkUpdateMonitorStatus(
  db: D1Database,
  ids: number[],
  status: string,
): Promise<BulkUpdateSummary> {
  const rows = await loadAssetRows(db, 'monitor', ids, { archived: 0 });
  const targetIds = rows.map((row) => row.id);
  const skippedIds = missingRequestedIds(ids, targetIds);
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
           updated_at=${sqlNowStored()}
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
  const skippedIds = missingRequestedIds(ids, targetIds);
  const rowsById = new Map(rows.map((row: any) => [row.id, row]));
  const statements = targetIds.map((id) => { const row: any = rowsById.get(id) || {}; return db.prepare(`UPDATE monitor_assets SET location_id=?, search_text_norm=?, updated_at=${sqlNowStored()} WHERE id=?`).bind(locationId, buildMonitorAssetSearchText(row, { employee_no: row.employee_no, employee_name: row.employee_name, department: row.department }), id); });
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
  const skippedIds = missingRequestedIds(ids, targetIds);
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
      db.prepare(`UPDATE monitor_assets SET status='ASSIGNED', employee_no=?, department=COALESCE(?, department), employee_name=?, is_employed='Y', search_text_norm=?, updated_at=${sqlNowStored()} WHERE id=?`).bind(owner.employee_no, owner.department, owner.employee_name, buildMonitorAssetSearchText(row, { employee_no: owner.employee_no, employee_name: owner.employee_name, department }), id),
    ];
  });
  await runBatchStatements(db, statements);
  return { changed: targetIds.length, skipped: skippedIds.length, ids: targetIds, skippedIds };
}

/**
 * 批量改领用人：必须原子地发 pc_out + 重算状态 + 重建 pc_asset_latest_state，不可撕裂。
 *
 * 背景：过去分两批：batch(pc_out + UPDATE pc_assets) -> batch(pc_asset_latest_state)。
 * 中间边界是撕裂的：第一批提交后、第二批发出前如果 Worker 超时/崩溃/重启，资产状态
 * 停在 ASSIGNED 但 pc_asset_latest_state 还是旧人，前端显示的「当前领用人」就错了。
 * 而且第一批里的 `UPDATE pc_assets SET status='ASSIGNED'` 又是无事件的直接状态写，
 * 与刚修完的 F3 (bulkUpdatePcStatus) 犯同一个错 —— 下次 recalc 会按台账把它推回去。
 *
 * 修法：
 *   1. pc_out、pc_assets.status 重算（内含派生表重建）全进一个批次，用守卫行收尾。
 *   2. 状态不再直接写，改由 buildPcAssetRecalcStatements 从台账推导，与 recalc 定义一致。
 *   3. 守卫断言每个资产都恰好留下一条 pc_out，否则整批回滚。
 *
 * 幂等性与去重：外层 loadAssetRows 过滤 archived=0 且 status='ASSIGNED'，这里再按
 * 「新老领用人完全相同」去重，留下 effectiveIds。一个资产只有领用人真的变了才发事件，
 * 避免无意义写放大（管理员勾 50 台、实际只有 3 台需要改，只发 3 条 pc_out）。
 */
export async function bulkUpdatePcOwner(
  db: D1Database,
  ids: number[],
  owner: { employee_no: string | null; department: string | null; employee_name: string },
  options: BulkOwnerWriteOptions = {},
): Promise<BulkPcOwnerSummary> {
  const rows = await loadAssetRows(db, 'pc', ids, { archived: 0, statuses: ['ASSIGNED'] });
  const targetIds = rows.map((row) => row.id);
  const skippedIds = missingRequestedIds(ids, targetIds);
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
  const effectiveIdSet = new Set(effectiveIds);
  const extraSkippedIds = targetIds.filter((id) => !effectiveIdSet.has(id));
  if (!effectiveIds.length) {
    return {
      changed: 0,
      skipped: skippedIds.length + extraSkippedIds.length,
      ids: [],
      skippedIds: [...skippedIds, ...extraSkippedIds],
      latestOutIds,
    };
  }

  // 建表是 DDL，不能进事务批次
  await ensurePcLatestStateTable(db);

  const outNoByAsset = new Map<number, string>(effectiveIds.map((assetId) => [assetId, pcOutNo()]));
  const stmts: D1PreparedStatement[] = [];
  for (const assetId of effectiveIds) {
    const latest = latestByAsset.get(assetId) || {};
    const outNo = outNoByAsset.get(assetId) as string;
    const department = owner.department ?? latest.department ?? null;
    stmts.push(
      db.prepare(
        `INSERT INTO pc_out (
          out_no, asset_id,
          employee_no, department, employee_name, is_employed,
          brand, serial_no, model,
          config_date, manufacture_date, warranty_end, disk_capacity, memory_size,
          remark, created_by, created_at
        )
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ${pcEventCreatedAtAfterLatest('a.id')}
          FROM pc_assets a WHERE a.id=? AND a.archived=0`
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
        assetId,
      )
    );
  }
  // 状态与派生表都从台账推导，保证与 recalc 的定义一致
  stmts.push(...buildPcAssetRecalcStatements(db, effectiveIds));
  // 守卫行：每个资产都必须恰好留下一条 pc_out，否则整批回滚
  stmts.push(
    db.prepare(guardRowCountSql('pc_out', 'out_no', effectiveIds.length))
      .bind(...effectiveIds.map((id) => outNoByAsset.get(id) as string), effectiveIds.length)
  );

  await runBatchWithGuard(db, stmts);
  return {
    changed: effectiveIds.length,
    skipped: skippedIds.length + extraSkippedIds.length,
    ids: effectiveIds,
    skippedIds: [...skippedIds, ...extraSkippedIds],
    latestOutIds,
  };
}
