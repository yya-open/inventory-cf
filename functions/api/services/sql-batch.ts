import { clampInt } from '../../utils/numeric';

export const D1_SAFE_ID_BATCH_SIZE = 50;
export const D1_REPEATED_ID_BATCH_SIZE = 10;

function assertIdentifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Invalid SQL identifier: ${value}`);
}

export function normalizePositiveIds(values: any[]) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => Math.trunc(Number(value || 0)))
    .filter((value) => Number.isFinite(value) && value > 0)));
}

export function chunkValues<T>(values: T[], batchSize = D1_SAFE_ID_BATCH_SIZE) {
  const size = clampInt(batchSize, D1_SAFE_ID_BATCH_SIZE, 1, D1_SAFE_ID_BATCH_SIZE);
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

export function d1Changes(result: any) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

export async function selectDistinctNumberColumnByIdChunks(
  db: D1Database,
  table: string,
  selectColumn: string,
  ids: number[],
  idColumn = 'id',
  batchSize = D1_SAFE_ID_BATCH_SIZE,
) {
  [table, selectColumn, idColumn].forEach(assertIdentifier);
  const output = new Set<number>();
  for (const chunk of chunkValues(normalizePositiveIds(ids), batchSize)) {
    const placeholders = chunk.map(() => '?').join(',');
    const { results } = await db.prepare(
      `SELECT DISTINCT ${selectColumn} FROM ${table} WHERE ${idColumn} IN (${placeholders})`
    ).bind(...chunk).all<any>();
    for (const row of results || []) {
      const value = Number((row as any)?.[selectColumn] || 0);
      if (value > 0) output.add(value);
    }
  }
  return [...output];
}

export async function deleteRowsByIdChunks(
  db: D1Database,
  table: string,
  ids: number[],
  idColumn = 'id',
  batchSize = D1_SAFE_ID_BATCH_SIZE,
) {
  [table, idColumn].forEach(assertIdentifier);
  let deleted = 0;
  for (const chunk of chunkValues(normalizePositiveIds(ids), batchSize)) {
    const placeholders = chunk.map(() => '?').join(',');
    const result = await db.prepare(`DELETE FROM ${table} WHERE ${idColumn} IN (${placeholders})`).bind(...chunk).run();
    deleted += d1Changes(result);
  }
  return deleted;
}
