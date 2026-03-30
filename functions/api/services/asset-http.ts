import { countByWhere, type QueryParts } from './asset-ledger';

type TimedEnv = { __timing?: { measure?: <T>(label: string, fn: () => Promise<T>) => Promise<T> } };

export async function ensureSchemaTimed(env: TimedEnv, label: string, fn: () => Promise<void>) {
  const measure = env?.__timing?.measure;
  return measure ? measure(label, fn) : fn();
}

export async function listAssetPage<T>(db: D1Database, env: TimedEnv, tableName: string, query: QueryParts, listFn: (db: D1Database, query: QueryParts) => Promise<T[]>) {
  const total = query.fast
    ? null
    : env?.__timing?.measure
      ? await env.__timing.measure('count', () => countByWhere(db, tableName, query))
      : await countByWhere(db, tableName, query);
  const data = env?.__timing?.measure
    ? await env.__timing.measure('query', () => listFn(db, query))
    : await listFn(db, query);
  return { data, total, page: query.page, pageSize: query.pageSize };
}

export async function countAssetPage(db: D1Database, env: TimedEnv, tableName: string, query: QueryParts) {
  return env?.__timing?.measure
    ? env.__timing.measure('count', () => countByWhere(db, tableName, query))
    : countByWhere(db, tableName, query);
}
