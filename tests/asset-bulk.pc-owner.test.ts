import { describe, expect, it } from 'vitest';
import { bulkUpdateMonitorOwner, bulkUpdatePcOwner } from '../functions/api/services/asset-bulk';

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
}

class FakeDB {
  pcAssets = [
    { id: 1, status: 'ASSIGNED', archived: 0 },
  ];
  pcOut = [
    { id: 10, asset_id: 1, employee_no: '1001', employee_name: 'Old Name', department: 'IT' },
  ];
  monitorAssets = [
    { id: 2, status: 'ASSIGNED', archived: 0, employee_no: '3003', employee_name: 'Old Monitor Name', department: 'Ops' },
  ];
  latestState = new Map<number, { employee_no: string | null; employee_name: string; department: string | null }>();

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  async batch(statements: FakeStatement[]) {
    for (const statement of statements) await statement.run();
    return statements.map(() => ({ success: true }));
  }

  all(sql: string, params: any[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.startsWith('select * from pc_assets where')) {
      const ids = new Set(params.filter((value) => Number(value) > 0).map((value) => Number(value)));
      return this.pcAssets.filter((row) => ids.has(row.id) && row.archived === 0 && row.status === 'ASSIGNED');
    }
    if (normalized.startsWith('select * from monitor_assets where')) {
      const ids = new Set(params.filter((value) => Number(value) > 0).map((value) => Number(value)));
      return this.monitorAssets.filter((row) => ids.has(row.id) && row.archived === 0);
    }
    if (normalized.startsWith('select x.asset_id, x.max_id as out_id')) {
      const ids = new Set(params.map((value) => Number(value)));
      return this.pcOut
        .filter((row) => ids.has(row.asset_id))
        .map((row) => ({ asset_id: row.asset_id, out_id: row.id, department: row.department }));
    }
    throw new Error(`Unhandled SQL: ${sql}`);
  }

  run(sql: string, params: any[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.startsWith('create table') || normalized.startsWith('create index')) return;
    if (normalized.startsWith('update pc_out set')) {
      const [employeeNo, department, employeeName, id] = params;
      const row = this.pcOut.find((item) => item.id === Number(id));
      if (!row) return;
      row.employee_no = employeeNo;
      row.employee_name = employeeName;
      row.department = department ?? row.department;
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
    if (normalized.startsWith('insert into pc_asset_latest_state')) {
      const [assetId, employeeNo, employeeName, department] = params;
      this.latestState.set(Number(assetId), { employee_no: employeeNo, employee_name: employeeName, department });
      return;
    }
    throw new Error(`Unhandled SQL: ${sql}`);
  }
}

describe('PC bulk owner update', () => {
  it('keeps the existing department when the batch owner form omits department', async () => {
    const db = new FakeDB();

    const result = await bulkUpdatePcOwner(db as any, [1], {
      employee_no: '2002',
      employee_name: 'New Name',
      department: null,
    });

    expect(result.changed).toBe(1);
    expect(db.pcOut[0]).toMatchObject({
      employee_no: '2002',
      employee_name: 'New Name',
      department: 'IT',
    });
    expect(db.latestState.get(1)).toEqual({
      employee_no: '2002',
      employee_name: 'New Name',
      department: 'IT',
    });
  });

  it('keeps the existing monitor department when the batch owner form omits department', async () => {
    const db = new FakeDB();

    const result = await bulkUpdateMonitorOwner(db as any, [2], {
      employee_no: '4004',
      employee_name: 'New Monitor Name',
      department: null,
    });

    expect(result.changed).toBe(1);
    expect(db.monitorAssets[0]).toMatchObject({
      employee_no: '4004',
      employee_name: 'New Monitor Name',
      department: 'Ops',
    });
  });
});
