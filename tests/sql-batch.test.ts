import { describe, expect, it } from 'vitest';
import { deleteRowsByIdChunks, selectDistinctNumberColumnByIdChunks } from '../functions/api/services/sql-batch';

class FakeBatchDb {
  queries: Array<{ sql: string; params: any[] }> = [];

  prepare(sql: string) {
    return {
      bind: (...params: any[]) => {
        this.queries.push({ sql, params });
        return {
          all: async () => ({
            results: params.map((id) => ({ asset_id: id + 1000 })),
          }),
          run: async () => ({ meta: { changes: params.length } }),
        };
      },
    };
  }
}

describe('D1 SQL batch helpers', () => {
  it('selects distinct numeric columns in safe id chunks', async () => {
    const db = new FakeBatchDb();
    const ids = Array.from({ length: 113 }, (_value, index) => index + 1);

    const result = await selectDistinctNumberColumnByIdChunks(db as any, 'pc_inventory_log', 'asset_id', ids);

    expect(result).toHaveLength(113);
    expect(db.queries.map((query) => query.params.length)).toEqual([50, 50, 13]);
  });

  it('deletes rows in safe id chunks', async () => {
    const db = new FakeBatchDb();
    const ids = Array.from({ length: 113 }, (_value, index) => index + 1);

    const deleted = await deleteRowsByIdChunks(db as any, 'monitor_tx', ids);

    expect(deleted).toBe(113);
    expect(db.queries.map((query) => query.params.length)).toEqual([50, 50, 13]);
    expect(db.queries.every((query) => query.sql.includes('DELETE FROM monitor_tx'))).toBe(true);
  });
});
