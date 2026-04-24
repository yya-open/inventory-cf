import { describe, expect, it } from 'vitest';
import { resolvePartsWarehouseId, type UserDataScope } from '../functions/api/services/data-scope';

class FakeStatement {
  private params: any[] = [];

  constructor(private db: FakeDB, private sql: string) {}

  bind(...params: any[]) {
    this.params = params;
    return this;
  }

  async first<T = any>() {
    return this.db.execute(this.sql, this.params, 'first') as T;
  }

  async all<T = any>() {
    return { results: this.db.execute(this.sql, this.params, 'all') as T[] };
  }
}

class FakeDB {
  constructor(private warehouses: Array<{ id: number; name: string }>) {}

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  execute(sql: string, params: any[], mode: 'first' | 'all') {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

    if (normalized === 'select id, name from warehouses where id=?') {
      const row = this.warehouses.find((warehouse) => warehouse.id === Number(params[0]));
      return row ? { ...row } : null;
    }

    if (normalized === 'select id, name from warehouses order by id asc') {
      return this.warehouses.map((warehouse) => ({ ...warehouse }));
    }

    throw new Error(`Unhandled SQL in FakeDB: ${sql}`);
  }
}

const partsScope: UserDataScope = {
  data_scope_type: 'warehouse',
  data_scope_value: '配件仓',
  data_scope_value2: null,
};

describe('resolvePartsWarehouseId', () => {
  it('rejects non-parts warehouse id when scope requires parts warehouse', async () => {
    const db = new FakeDB([
      { id: 1, name: '配件仓' },
      { id: 2, name: '电脑仓' },
    ]);

    await expect(resolvePartsWarehouseId(db as any, partsScope, 2)).resolves.toBe(-1);
  });

  it('accepts requested warehouse id when it is parts warehouse', async () => {
    const db = new FakeDB([
      { id: 1, name: '电脑仓' },
      { id: 3, name: '配件仓' },
    ]);

    await expect(resolvePartsWarehouseId(db as any, partsScope, 3)).resolves.toBe(3);
  });

  it('falls back to first parts warehouse when requested id is missing', async () => {
    const db = new FakeDB([
      { id: 1, name: '电脑仓' },
      { id: 2, name: '显示器仓' },
      { id: 8, name: '主仓' },
    ]);

    await expect(resolvePartsWarehouseId(db as any, partsScope, 999)).resolves.toBe(8);
  });
});
