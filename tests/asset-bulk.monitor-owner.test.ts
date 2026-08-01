import { describe, expect, it } from 'vitest';
import { bulkUpdateMonitorOwner } from '../functions/api/services/asset-bulk';
import { assertMonitorMovementAllowed, resolveMonitorAssetForMovement } from '../functions/api/services/asset-write';

class FakeStatement {
  private params: any[] = [];

  constructor(private db: FakeDB, private sql: string) {}

  bind(...params: any[]) {
    this.params = params;
    return this;
  }

  async all<T = any>() {
    return { results: this.db.all(this.sql, this.params) as T[] } as any;
  }

  async run() {
    this.db.run(this.sql, this.params);
    return { success: true } as any;
  }

  async first<T = any>() {
    return (this.db.first(this.sql, this.params) ?? null) as T;
  }
}

/** 只覆盖显示器侧所需的那部分 SQL；PC 侧已迁至真实 SQLite 的测试文件。 */
class FakeDB {
  monitorAssets = [
    { id: 2, status: 'ASSIGNED', archived: 0, employee_no: '3003', employee_name: 'Old Monitor Name', department: 'Ops', asset_code: 'M-1', sn: 'MSN-1', brand: 'Dell', model: 'U2720', size_inch: '27', location_id: 7 },
  ];
  monitorTx = [
    { id: 20, asset_id: 2, tx_type: 'OUT', employee_no: '3003', employee_name: 'Old Monitor Name', department: 'Ops', from_location_id: 7, to_location_id: 7 },
  ];

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  async batch(statements: FakeStatement[]) {
    for (const statement of statements) await statement.run();
    return statements.map(() => ({ success: true }));
  }

  all(sql: string, params: any[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.startsWith('select * from monitor_assets where')) {
      const ids = new Set(params.filter((value) => Number(value) > 0).map((value) => Number(value)));
      return this.monitorAssets.filter((row) => ids.has(row.id) && row.archived === 0);
    }
    throw new Error(`Unhandled SQL: ${sql}`);
  }

  first(sql: string, params: any[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.startsWith('select tx_type, employee_no, department, employee_name, is_employed from monitor_tx where asset_id=')) {
      const assetId = Number(params[0]);
      return this.monitorTx
        .filter((row) => row.asset_id === assetId)
        .sort((a, b) => b.id - a.id)[0] || null;
    }
    throw new Error(`Unhandled SQL: ${sql}`);
  }

  run(sql: string, params: any[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.startsWith('create table') || normalized.startsWith('create index')) return;
    if (normalized.startsWith('insert into monitor_tx')) {
      const [txNo, txType, assetId, assetCode, sn, brand, model, sizeInch, fromLocationId, toLocationId, employeeNo, department, employeeName] = params;
      this.monitorTx.push({
        id: this.monitorTx.length ? Math.max(...this.monitorTx.map((row) => row.id)) + 1 : 1,
        tx_no: txNo,
        tx_type: txType,
        asset_id: Number(assetId),
        asset_code: assetCode,
        sn,
        brand,
        model,
        size_inch: sizeInch,
        from_location_id: fromLocationId,
        to_location_id: toLocationId,
        employee_no: employeeNo,
        department,
        employee_name: employeeName,
      });
      return;
    }
    if (normalized.startsWith('update monitor_assets set')) {
      const [employeeNo, department, employeeName, , id] = params;
      const row = this.monitorAssets.find((item) => item.id === Number(id));
      if (!row) return;
      row.status = 'ASSIGNED';
      row.employee_no = employeeNo;
      row.employee_name = employeeName;
      row.department = department ?? row.department;
      return;
    }
    throw new Error(`Unhandled SQL: ${sql}`);
  }
}

describe('bulk owner update history', () => {
  // PC 侧的覆盖已迁至 tests/pc-write-paths.atomicity.test.ts：那里在真实 SQLite 上执行，
  // 能同时验证事务边界与状态重算，而本文件的 FakeDB 只是按字符串匹配 SQL、自己模拟结果，
  // 无法证明真实 SQL 的行为。本文件保留显示器侧的用例（本轮未改动）。
  it('appends a monitor history row so the previous owner stays visible', async () => {
    const db = new FakeDB();

    const result = await bulkUpdateMonitorOwner(db as any, [2], {
      employee_no: '4004',
      employee_name: 'New Monitor Name',
      department: null,
    }, { createdBy: 'tester', ip: '127.0.0.1', ua: 'vitest' });

    expect(result.changed).toBe(1);
    expect(db.monitorTx).toHaveLength(2);
    expect(db.monitorTx[0]).toMatchObject({
      employee_no: '3003',
      employee_name: 'Old Monitor Name',
      department: 'Ops',
    });
    expect(db.monitorTx[1]).toMatchObject({
      tx_type: 'OUT',
      employee_no: '4004',
      employee_name: 'New Monitor Name',
      department: 'Ops',
    });
    expect(db.monitorAssets[0]).toMatchObject({
      employee_no: '4004',
      employee_name: 'New Monitor Name',
      department: 'Ops',
    });
  });

  it('allows monitor return when owner history exists but the asset status is stale', async () => {
    const db = new FakeDB();
    db.monitorAssets[0].status = 'IN_STOCK';
    await bulkUpdateMonitorOwner(db as any, [2], {
      employee_no: '4004',
      employee_name: 'New Monitor Name',
      department: null,
    }, { createdBy: 'tester' });
    db.monitorAssets[0].status = 'IN_STOCK';

    const resolved = await resolveMonitorAssetForMovement(db as any, db.monitorAssets[0], 'RETURN');

    expect(resolved).toMatchObject({
      status: 'ASSIGNED',
      employee_no: '4004',
      employee_name: 'New Monitor Name',
      department: 'Ops',
    });
    expect(() => assertMonitorMovementAllowed(resolved, 'RETURN')).not.toThrow();
  });
});
