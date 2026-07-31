import { sqlNowStored } from "../_time";
import { buildPcLatestStateRebuildStatements, ensurePcLatestStateTable } from '../services/pc-latest-state';
import { chunkValues, normalizePositiveIds } from '../services/sql-batch';

/**
 * 资产状态推导表达式（SQL 版）：取该资产最新一条台账事件，按事件类型映射状态。
 * 排序与历史 JS 实现一致：created_at DESC, rid DESC（pc_in / pc_out / pc_recycle / pc_scrap 的 UNION ALL）。
 * 关联列写死为 pc_assets.id，只能用在 UPDATE pc_assets 里。
 */
function pcLatestStatusExpr() {
  return `(
    SELECT CASE evt.evt_type
             WHEN 'OUT' THEN 'ASSIGNED'
             WHEN 'RECYCLE' THEN 'RECYCLED'
             WHEN 'SCRAP' THEN 'SCRAPPED'
             WHEN 'RETURN' THEN 'IN_STOCK'
             WHEN 'IN' THEN 'IN_STOCK'
             ELSE 'IN_STOCK'
           END
      FROM (
        SELECT 'IN' AS evt_type, created_at, id AS rid FROM pc_in WHERE asset_id = pc_assets.id
        UNION ALL
        SELECT 'OUT' AS evt_type, created_at, id AS rid FROM pc_out WHERE asset_id = pc_assets.id
        UNION ALL
        SELECT UPPER(action) AS evt_type, created_at, id AS rid FROM pc_recycle WHERE asset_id = pc_assets.id
        UNION ALL
        SELECT 'SCRAP' AS evt_type, created_at, id AS rid FROM pc_scrap WHERE asset_id = pc_assets.id
      ) evt
     ORDER BY evt.created_at DESC, evt.rid DESC
     LIMIT 1
  )`;
}

/**
 * 生成 pc_assets.status 的重算语句（纯 SQL，不预读）。
 * 状态在写事务内由 SQL 推导，避免"先 SELECT 后 UPDATE"被并发写入覆盖。
 * 每条语句最多 D1_SAFE_ID_BATCH_SIZE(50) 个绑定参数，远低于 D1 单语句 100 个的上限。
 */
export function buildPcAssetStatusRecalcStatements(db: D1Database, assetIds: (number | string)[]): D1PreparedStatement[] {
  const ids = normalizePositiveIds(assetIds);
  if (!ids.length) return [];
  const statements: D1PreparedStatement[] = [];
  for (const chunkIds of chunkValues(ids)) {
    const placeholders = chunkIds.map(() => '?').join(',');
    statements.push(
      db.prepare(
        `UPDATE pc_assets
            SET status = COALESCE(${pcLatestStatusExpr()}, 'IN_STOCK'),
                updated_at = ${sqlNowStored()}
          WHERE id IN (${placeholders})`
      ).bind(...chunkIds)
    );
  }
  return statements;
}

/**
 * 生成状态重算 + 派生表重建的全部语句，供调用方与自己的写入放进同一个批次。
 * 顺序不能调换：pc_asset_latest_state 依赖重算后的 pc_assets.status（同一批次内先写后读可见）。
 */
export function buildPcAssetRecalcStatements(db: D1Database, assetIds: (number | string)[]): D1PreparedStatement[] {
  const ids = normalizePositiveIds(assetIds);
  if (!ids.length) return [];
  return [
    ...buildPcAssetStatusRecalcStatements(db, ids),
    ...buildPcLatestStateRebuildStatements(db, ids),
  ];
}

export async function recalcPcAssetStatuses(db: D1Database, assetIds: (number | string)[]) {
  const ids = normalizePositiveIds(assetIds);
  if (!ids.length) return;
  await ensurePcLatestStateTable(db);
  const statements = buildPcAssetRecalcStatements(db, ids);
  if (statements.length) await db.batch(statements);
}
