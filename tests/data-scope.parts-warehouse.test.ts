import { describe, expect, it } from 'vitest';
import { PERMISSION_WAREHOUSE_OPTIONS } from '../src/utils/dataScope';
import {
  ASSET_WAREHOUSE_OPTIONS,
  getRequiredDepartment,
  getRequiredWarehouses,
  normalizeUserDataScope,
  resolvePartsWarehouseId,
  scopeAllowsAssetWarehouse,
  type UserDataScope,
} from '../functions/api/services/data-scope';

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

describe('pc and monitor combined warehouse scope', () => {
  it('normalizes aliases and allows only pc plus monitor asset warehouses', () => {
    const scope = normalizeUserDataScope('warehouse', '电脑/显示器仓');

    expect(scope).toEqual({
      data_scope_type: 'warehouse',
      data_scope_value: JSON.stringify(['电脑仓', '显示器仓']),
      data_scope_value2: null,
    });
    expect(scopeAllowsAssetWarehouse(scope, '电脑仓')).toBe(true);
    expect(scopeAllowsAssetWarehouse(scope, '显示器仓')).toBe(true);
    expect(scopeAllowsAssetWarehouse(scope, '配件仓')).toBe(false);
  });

  it('supports multiple authorized warehouse scopes from json arrays', async () => {
    const scope = normalizeUserDataScope('warehouse', JSON.stringify(['配件仓', '电脑仓']));
    const db = new FakeDB([
      { id: 1, name: '配件仓' },
      { id: 2, name: '电脑仓' },
    ]);

    expect(scopeAllowsAssetWarehouse(scope, '配件仓')).toBe(true);
    expect(scopeAllowsAssetWarehouse(scope, '电脑仓')).toBe(true);
    expect(scopeAllowsAssetWarehouse(scope, '显示器仓')).toBe(false);
    await expect(resolvePartsWarehouseId(db as any, scope, 1)).resolves.toBe(1);
  });
});

describe('permission data scope matrix', () => {
  const warehouses = ['配件仓', '电脑仓', '显示器仓'] as const;

  it('keeps frontend and backend permission warehouse constants aligned', () => {
    expect([...PERMISSION_WAREHOUSE_OPTIONS]).toEqual([...ASSET_WAREHOUSE_OPTIONS]);
  });

  it.each([
    {
      name: 'all scope allows every warehouse without department constraint',
      scope: normalizeUserDataScope('all', null, null),
      allowed: ['配件仓', '电脑仓', '显示器仓'],
      department: null,
      requiredWarehouses: null,
    },
    {
      name: 'department scope allows every asset warehouse within the department constraint',
      scope: normalizeUserDataScope('department', '财务部', null),
      allowed: ['配件仓', '电脑仓', '显示器仓'],
      department: '财务部',
      requiredWarehouses: null,
    },
    {
      name: 'warehouse scope supports a single warehouse',
      scope: normalizeUserDataScope('warehouse', '电脑仓', null),
      allowed: ['电脑仓'],
      department: null,
      requiredWarehouses: ['电脑仓'],
    },
    {
      name: 'warehouse scope supports multiple warehouse selections',
      scope: normalizeUserDataScope('warehouse', JSON.stringify(['配件仓', '显示器仓']), null),
      allowed: ['配件仓', '显示器仓'],
      department: null,
      requiredWarehouses: ['配件仓', '显示器仓'],
    },
    {
      name: 'department plus warehouse scope applies both dimensions',
      scope: normalizeUserDataScope('department_warehouse', '研发部', JSON.stringify(['电脑仓', '显示器仓'])),
      allowed: ['电脑仓', '显示器仓'],
      department: '研发部',
      requiredWarehouses: ['电脑仓', '显示器仓'],
    },
  ])('$name', ({ scope, allowed, department, requiredWarehouses }) => {
    for (const warehouse of warehouses) {
      expect(scopeAllowsAssetWarehouse(scope, warehouse)).toBe(allowed.includes(warehouse));
    }
    expect(getRequiredDepartment(scope)).toBe(department);
    expect(getRequiredWarehouses(scope)).toEqual(requiredWarehouses);
  });
});
