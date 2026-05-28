/**
 * 批量操作优化工具函数
 * 减少 N+1 查询，使用 db.batch() 批量执行
 */

/**
 * 批量检查幂等号是否存在
 * @returns Map<no, existingRow>
 */
export async function batchFindExistingByNo(
  db: D1Database,
  table: string,
  noColumn: string,
  nos: string[],
  select = '*'
): Promise<Map<string, any>> {
  const result = new Map<string, any>();
  if (!nos.length) return result;

  // 分批查询，避免 SQL 参数过多
  const batchSize = 100;
  for (let i = 0; i < nos.length; i += batchSize) {
    const batch = nos.slice(i, i + batchSize);
    const placeholders = batch.map(() => '?').join(',');
    const { results } = await db
      .prepare(`SELECT ${select} FROM ${table} WHERE ${noColumn} IN (${placeholders})`)
      .bind(...batch)
      .all();
    for (const row of (results || []) as any[]) {
      const key = String((row as any)[noColumn] || '');
      if (key) result.set(key, row);
    }
  }
  return result;
}

/**
 * 批量检查序列号是否存在
 * @returns Map<normalizedSerial, existingRow>
 */
export async function batchFindAssetsBySerial(
  db: D1Database,
  serials: string[],
  table = 'pc_assets'
): Promise<Map<string, any>> {
  const result = new Map<string, any>();
  if (!serials.length) return result;

  const normalized = serials.map(s => String(s || '').trim().toUpperCase()).filter(Boolean);
  if (!normalized.length) return result;

  // 分批查询
  const batchSize = 100;
  for (let i = 0; i < normalized.length; i += batchSize) {
    const batch = normalized.slice(i, i + batchSize);
    const placeholders = batch.map(() => '?').join(',');
    const { results } = await db
      .prepare(`SELECT * FROM ${table} WHERE UPPER(TRIM(serial_no)) IN (${placeholders})`)
      .bind(...batch)
      .all();
    for (const row of (results || []) as any[]) {
      const key = String(row?.serial_no || '').trim().toUpperCase();
      if (key) result.set(key, row);
    }
  }
  return result;
}

/**
 * 批量查询资产（通过 ID 或序列号）
 */
export async function batchFindAssetsByIds(
  db: D1Database,
  ids: number[],
  table = 'pc_assets'
): Promise<Map<number, any>> {
  const result = new Map<number, any>();
  if (!ids.length) return result;

  const uniqueIds = [...new Set(ids)].filter(id => id > 0);
  const batchSize = 100;
  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const batch = uniqueIds.slice(i, i + batchSize);
    const placeholders = batch.map(() => '?').join(',');
    const { results } = await db
      .prepare(`SELECT * FROM ${table} WHERE id IN (${placeholders})`)
      .bind(...batch)
      .all();
    for (const row of (results || []) as any[]) {
      result.set(Number(row?.id || 0), row);
    }
  }
  return result;
}

/**
 * 批量查询资产历史计数
 */
export async function batchGetAssetHistoryCounts(
  db: D1Database,
  assetIds: number[]
): Promise<Map<number, { pcIn: number; pcOut: number; pcRecycle: number; pcScrap: number }>> {
  const result = new Map();
  if (!assetIds.length) return result;

  const uniqueIds = [...new Set(assetIds)].filter(id => id > 0);
  const batchSize = 50;
  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const batch = uniqueIds.slice(i, i + batchSize);
    const placeholders = batch.map(() => '?').join(',');
    const { results } = await db
      .prepare(`
        SELECT
          asset_id,
          (SELECT COUNT(*) FROM pc_in WHERE asset_id=a.id) AS pc_in,
          (SELECT COUNT(*) FROM pc_out WHERE asset_id=a.id) AS pc_out,
          (SELECT COUNT(*) FROM pc_recycle WHERE asset_id=a.id) AS pc_recycle,
          (SELECT COUNT(*) FROM pc_scrap WHERE asset_id=a.id) AS pc_scrap
        FROM pc_assets a
        WHERE a.id IN (${placeholders})
      `)
      .bind(...batch)
      .all();
    for (const row of (results || []) as any[]) {
      result.set(Number(row?.asset_id || 0), {
        pcIn: Number(row?.pc_in || 0),
        pcOut: Number(row?.pc_out || 0),
        pcRecycle: Number(row?.pc_recycle || 0),
        pcScrap: Number(row?.pc_scrap || 0),
      });
    }
  }
  return result;
}

/**
 * 安全的标识符校验（防 SQL 注入）
 */
export function safeIdentifier(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return name;
}

/**
 * 批量执行 D1PreparedStatement 并收集结果
 */
export async function executeBatchStatements(
  db: D1Database,
  statements: D1PreparedStatement[],
  options?: { throwOnError?: boolean }
): Promise<D1Result[]> {
  if (!statements.length) return [];

  // D1 batch 限制：每批最多 100 条语句
  const batchSize = 100;
  const results: D1Result[] = [];

  for (let i = 0; i < statements.length; i += batchSize) {
    const batch = statements.slice(i, i + batchSize);
    try {
      const batchResults = await db.batch(batch);
      results.push(...batchResults);
    } catch (error) {
      if (options?.throwOnError) throw error;
      // 记录错误但继续执行
      console.warn('[batch-utils] Batch execution error:', error);
    }
  }
  return results;
}

/**
 * 生成批量插入的占位符
 */
export function buildPlaceholders(count: number, columns: number): string {
  const row = `(${Array(columns).fill('?').join(',')})`;
  return Array(count).fill(row).join(',');
}
