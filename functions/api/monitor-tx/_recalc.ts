import { sqlNowStored } from "../_time";
import { chunkValues, normalizePositiveIds } from '../services/sql-batch';

/**
 * 需要被替换成空格的分隔符，与 functions/api/_search.ts 里 normalizeSearchText 的正则保持一致。
 * CHAR(12288)=全角空格 U+3000，CHAR(9)/CHAR(10)/CHAR(13)=制表符/换行/回车。
 */
const SEARCH_TEXT_SEPARATOR_SQL = [
  `'·'`,
  `'•'`,
  `'|'`,
  `','`,
  `'，'`,
  `';'`,
  `'；'`,
  `'/'`,
  `'\\'`,
  `'('`,
  `')'`,
  `'['`,
  `']'`,
  `'{'`,
  `'}'`,
  `CHAR(12288)`,
  `CHAR(9)`,
  `CHAR(10)`,
  `CHAR(13)`,
];

/**
 * normalizeSearchText 的 SQL 等价实现：拼接 -> 分隔符转空格 -> 转小写 -> 折叠连续空格 -> 去首尾空格。
 * 折叠用的是 SQLite 常见写法：' ' 换成 CHAR(1)||CHAR(2)，删掉 CHAR(2)||CHAR(1)，再还原成一个空格。
 * 注意：SQLite 的 LOWER() 只处理 ASCII，全角字母不会被转小写（与 JS 端的差异，中文/编码字段无影响）。
 */
function sqlNormalizeSearchText(columns: string[]) {
  let expr = columns.map((column) => `COALESCE(${column}, '')`).join(` || ' ' || `);
  for (const separator of SEARCH_TEXT_SEPARATOR_SQL) expr = `REPLACE(${expr}, ${separator}, ' ')`;
  const collapsed = `REPLACE(REPLACE(REPLACE(LOWER(${expr}), ' ', CHAR(1) || CHAR(2)), CHAR(2) || CHAR(1), ''), CHAR(1) || CHAR(2), ' ')`;
  return `TRIM(${collapsed})`;
}

const MONITOR_TX_SEARCH_COLUMNS = ['t.asset_code', 't.sn', 't.brand', 't.model', 't.size_inch', 't.remark'];
const MONITOR_TX_SEARCH_WITH_EMPLOYEE = sqlNormalizeSearchText([
  ...MONITOR_TX_SEARCH_COLUMNS,
  't.employee_no',
  't.employee_name',
  't.department',
]);
const MONITOR_TX_SEARCH_WITHOUT_EMPLOYEE = sqlNormalizeSearchText(MONITOR_TX_SEARCH_COLUMNS);

/**
 * 生成显示器资产的重算语句（纯 SQL，不预读）。
 * 状态与在职信息在写事务内由 SQL 从最新流水推导，避免"先 SELECT 后 UPDATE"被并发写入覆盖。
 * 类型映射与历史 JS 实现一致：OUT->ASSIGNED、IN/RETURN->IN_STOCK、SCRAP->SCRAPPED、
 * TRANSFER 只改位置与检索文本、ADJUST（及未知类型）只改 updated_at、无流水则整体回落到 IN_STOCK。
 * 排序同样是 created_at DESC, id DESC。每条语句的绑定参数不超过 50 个（D1 上限 100）。
 */
export function buildMonitorAssetRecalcStatements(db: D1Database, assetIds: (number | string)[]): D1PreparedStatement[] {
  const ids = normalizePositiveIds(assetIds);
  if (!ids.length) return [];
  const statements: D1PreparedStatement[] = [];
  for (const chunkIds of chunkValues(ids)) {
    const placeholders = chunkIds.map(() => '?').join(',');
    statements.push(
      db.prepare(
        `UPDATE monitor_assets
            SET status = CASE t.tx_type
                           WHEN 'OUT' THEN 'ASSIGNED'
                           WHEN 'IN' THEN 'IN_STOCK'
                           WHEN 'RETURN' THEN 'IN_STOCK'
                           WHEN 'SCRAP' THEN 'SCRAPPED'
                           ELSE monitor_assets.status
                         END,
                location_id = CASE WHEN t.tx_type IN ('OUT','IN','RETURN','TRANSFER')
                                   THEN NULLIF(t.to_location_id, 0)
                                   ELSE monitor_assets.location_id
                              END,
                employee_no = CASE t.tx_type
                                WHEN 'OUT' THEN NULLIF(t.employee_no, '')
                                WHEN 'IN' THEN NULL
                                WHEN 'RETURN' THEN NULL
                                WHEN 'SCRAP' THEN NULL
                                ELSE monitor_assets.employee_no
                              END,
                department = CASE t.tx_type
                               WHEN 'OUT' THEN NULLIF(t.department, '')
                               WHEN 'IN' THEN NULL
                               WHEN 'RETURN' THEN NULL
                               WHEN 'SCRAP' THEN NULL
                               ELSE monitor_assets.department
                             END,
                employee_name = CASE t.tx_type
                                  WHEN 'OUT' THEN NULLIF(t.employee_name, '')
                                  WHEN 'IN' THEN NULL
                                  WHEN 'RETURN' THEN NULL
                                  WHEN 'SCRAP' THEN NULL
                                  ELSE monitor_assets.employee_name
                                END,
                is_employed = CASE t.tx_type
                                WHEN 'OUT' THEN NULLIF(t.is_employed, '')
                                WHEN 'IN' THEN NULL
                                WHEN 'RETURN' THEN NULL
                                WHEN 'SCRAP' THEN NULL
                                ELSE monitor_assets.is_employed
                              END,
                search_text_norm = CASE
                                     WHEN t.tx_type IN ('OUT','TRANSFER') THEN ${MONITOR_TX_SEARCH_WITH_EMPLOYEE}
                                     WHEN t.tx_type IN ('IN','RETURN','SCRAP') THEN ${MONITOR_TX_SEARCH_WITHOUT_EMPLOYEE}
                                     ELSE monitor_assets.search_text_norm
                                   END,
                updated_at = ${sqlNowStored()}
           FROM (
             SELECT ranked.asset_id, ranked.tx_type, ranked.to_location_id,
                    ranked.employee_no, ranked.department, ranked.employee_name, ranked.is_employed,
                    ranked.asset_code, ranked.sn, ranked.brand, ranked.model, ranked.size_inch, ranked.remark
               FROM (
                 SELECT tx.*,
                        ROW_NUMBER() OVER (PARTITION BY tx.asset_id ORDER BY tx.created_at DESC, tx.id DESC) AS rn
                   FROM monitor_tx tx
                  WHERE tx.asset_id IN (${placeholders})
               ) ranked
              WHERE ranked.rn = 1
           ) t
          WHERE monitor_assets.id = t.asset_id`
      ).bind(...chunkIds)
    );
    // 没有任何流水的资产：回落到入库态并清空在职信息（与历史实现一致，不动 location_id）
    statements.push(
      db.prepare(
        `UPDATE monitor_assets
            SET status='IN_STOCK', employee_no=NULL, department=NULL, employee_name=NULL, is_employed=NULL,
                search_text_norm='', updated_at=${sqlNowStored()}
          WHERE id IN (${placeholders})
            AND NOT EXISTS (SELECT 1 FROM monitor_tx tx WHERE tx.asset_id = monitor_assets.id)`
      ).bind(...chunkIds)
    );
  }
  return statements;
}

export async function recalcMonitorAssets(db: D1Database, assetIds: number[]) {
  const statements = buildMonitorAssetRecalcStatements(db, assetIds);
  if (statements.length) await db.batch(statements);
}
