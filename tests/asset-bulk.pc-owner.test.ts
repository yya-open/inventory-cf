import { describe, expect, it } from 'vitest';
import { bulkUpdateMonitorOwner, bulkUpdatePcOwner } from '../functions/api/services/asset-bulk';
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

class FakeDB {
  pcAssets = [
    { id: 1, status: 'ASSIGNED', archived: 0, brand: '联想', serial_no: 'SN-1', model: 'P16', manufacture_date: '2025-01-01', warranty_end: null, disk_capacity: '512G', memory_size: '32G' },
  ];
  pcOut = [
    { id: 10, asset_id: 1, employee_no: '1001', employee_name: 'Old Name', department: 'IT', is_employed: 'Y', brand: '联想', serial_no: 'SN-1', model: 'P16', manufacture_date: '2025-01-01', warranty_end: null, disk_capacity: '512G', memory_size: '32G', config_date: null, remark: null, created_by: 'seed' },
  ];
  monitorAssets = [
    { id: 2, status: 'ASSIGNED', archived: 0, employee_no: '3003', employee_name: 'Old Monitor Name', department: 'Ops', asset_code: 'M-1', sn: 'MSN-1', brand: 'Dell', model: 'U2720', size_inch: '27', location_id: 7 },
  ];
  monitorTx = [
    { id: 20, asset_id: 2, tx_type: 'OUT', employee_no: '3003', employee_name: 'Old Monitor Name', department: 'Ops', from_location_id: 7, to_location_id: 7 },
  ];
  latestState = new Map<number, { employee_no: string | null; employee_name: string; department: string | null; last_out_id?: number | null }>();

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
      const outByAsset = new Map<number, any>();
      for (const row of this.pcOut) {
        if (!ids.has(row.asset_id)) continue;
        const prev = outByAsset.get(row.asset_id);
        if (!prev || row.id > prev.id) outByAsset.set(row.asset_id, row);
      }
      return Array.from(outByAsset.values()).map((row) => ({
        asset_id: row.asset_id,
        out_id: row.id,
        employee_no: row.employee_no,
        employee_name: row.employee_name,
        department: row.department,
        is_employed: row.is_employed,
        brand: row.brand,
        serial_no: row.serial_no,
        model: row.model,
        manufacture_date: row.manufacture_date,
        warranty_end: row.warranty_end,
        disk_capacity: row.disk_capacity,
        memory_size: row.memory_size,
      }));
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
    if (normalized.startsWith('insert into pc_out')) {
      const [outNo, assetId, employeeNo, department, employeeName, isEmployed, brand, serialNo, model, configDate, manufactureDate, warrantyEnd, diskCapacity, memorySize, remark, createdBy] = params;
      this.pcOut.push({
        id: this.pcOut.length ? Math.max(...this.pcOut.map((row) => row.id)) + 1 : 1,
        out_no: outNo,
        asset_id: Number(assetId),
        employee_no: employeeNo,
        department,
        employee_name: employeeName,
        is_employed: isEmployed,
        brand,
        serial_no: serialNo,
        model,
        config_date: configDate,
        manufacture_date: manufactureDate,
        warranty_end: warrantyEnd,
        disk_capacity: diskCapacity,
        memory_size: memorySize,
        remark,
        created_by: createdBy,
      });
      return;
    }
    if (normalized.startsWith('update pc_assets set status=')) {
      const [assetId] = params;
      const row = this.pcAssets.find((item) => item.id === Number(assetId));
      if (row) row.status = 'ASSIGNED';
      return;
    }
    if (normalized.startsWith('insert into pc_asset_latest_state')) {
      const [assetId, outNo, employeeNo, employeeName, department] = params;
      const latestOut = this.pcOut.find((row) => row.out_no === outNo);
      this.latestState.set(Number(assetId), { employee_no: employeeNo, employee_name: employeeName, department, last_out_id: latestOut?.id ?? null });
      return;
    }
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
  it('appends a pc history row so the previous owner stays visible', async () => {
    const db = new FakeDB();

    const result = await bulkUpdatePcOwner(db as any, [1], {
      employee_no: '2002',
      employee_name: 'New Name',
      department: null,
    }, { createdBy: 'tester' });

    expect(result.changed).toBe(1);
    expect(db.pcOut).toHaveLength(2);
    expect(db.pcOut[0]).toMatchObject({
      employee_no: '1001',
      employee_name: 'Old Name',
      department: 'IT',
    });
    expect(db.pcOut[1]).toMatchObject({
      employee_no: '2002',
      employee_name: 'New Name',
      department: 'IT',
      created_by: 'tester',
    });
    expect(db.latestState.get(1)).toEqual({
      employee_no: '2002',
      employee_name: 'New Name',
      department: 'IT',
      last_out_id: db.pcOut[1].id,
    });
  });

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
