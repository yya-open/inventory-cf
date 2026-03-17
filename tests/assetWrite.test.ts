import { describe, expect, it } from 'vitest';
import {
  applyMonitorMovement,
  createPcInRecord,
  normalizePcRecycleAction,
  parseMonitorOutFields,
  parseMonitorTarget,
  validatePcScrapAssets,
} from '../functions/api/services/asset-write';

class MockStmt {
  sql: string;
  bound: any[] = [];
  db: MockDb;
  constructor(db: MockDb, sql: string) {
    this.db = db;
    this.sql = sql;
  }
  bind(...args: any[]) {
    this.bound = args;
    return this;
  }
  async first<T>() {
    return (this.db.firstQueue.shift() ?? null) as T;
  }
  async run() {
    this.db.runs.push({ sql: this.sql, bound: this.bound });
    return { meta: { last_row_id: 101, changes: 1 } } as any;
  }
  async all<T>() {
    return { results: (this.db.allQueue.shift() ?? []) as T[] } as any;
  }
}

class MockDb {
  firstQueue: any[] = [];
  allQueue: any[] = [];
  runs: Array<{ sql: string; bound: any[] }> = [];
  batches: Array<Array<{ sql: string; bound: any[] }>> = [];
  prepare(sql: string) {
    return new MockStmt(this, sql);
  }
  async batch(stmts: MockStmt[]) {
    this.batches.push(stmts.map((s) => ({ sql: s.sql, bound: s.bound })));
    return [{ meta: { last_row_id: 101, changes: 1 } }] as any;
  }
}

describe('asset write services', () => {
  it('creates pc in records with normalized created_by and stored-time SQL', async () => {
    const db = new MockDb();
    db.firstQueue.push(null); // existing serial lookup
    db.firstQueue.push({ id: 101 }); // fetch inserted asset id

    const result = await createPcInRecord(db as any, {
      brand: 'Dell',
      serial_no: 'SN-1',
      model: '5480',
      manufacture_date: '2022-01-01',
      warranty_end: null,
      disk_capacity: '512G',
      memory_size: '16G',
      remark: 'ok',
    }, 'alice');

    expect(result.asset_id).toBe(101);
    expect(db.batches[0][0].sql).toContain("datetime('now','+8 hours')");
    const insertPcIn = db.runs.find((r) => r.sql.includes('INSERT INTO pc_in'));
    expect(insertPcIn?.bound.at(-1)).toBe('alice');
  });

  it('normalizes recycle actions from english and chinese', () => {
    expect(normalizePcRecycleAction('return')).toBe('RETURN');
    expect(normalizePcRecycleAction('回收')).toBe('RECYCLE');
  });

  it('validates pc scrap states before batch update', () => {
    expect(() => validatePcScrapAssets([{ id: 1, serial_no: 'A', status: 'ASSIGNED' }])).toThrow(/不能直接报废/);
    expect(() => validatePcScrapAssets([{ id: 2, serial_no: 'B', status: 'SCRAPPED' }])).toThrow(/无需重复报废/);
  });

  it('parses monitor out fields and target ids', () => {
    expect(parseMonitorTarget({ asset_code: ' M-01 ' })).toEqual({ asset_id: 0, asset_code: 'M-01' });
    const fields = parseMonitorOutFields({
      employee_no: 'E01',
      employee_name: 'Alice',
      department: 'IT',
      location_id: '9',
      remark: '  test ',
    });
    expect(fields).toMatchObject({ employee_no: 'E01', employee_name: 'Alice', department: 'IT', to_location_id: 9, remark: 'test' });
  });

  it('applies monitor out movement with shared tx/update logic', async () => {
    const db = new MockDb();
    const result = await applyMonitorMovement(db as any, {
      txType: 'OUT',
      prefix: 'MONOUT',
      asset: {
        id: 8,
        asset_code: 'MON-8',
        sn: 'SN8',
        brand: 'Dell',
        model: 'U2720',
        size_inch: '27',
        status: 'IN_STOCK',
        location_id: 3,
        employee_no: null,
        department: null,
        employee_name: null,
        is_employed: null,
      },
      to_location_id: 5,
      employee_no: 'E01',
      department: 'IT',
      employee_name: 'Alice',
      is_employed: '是',
      remark: 'deploy',
      createdBy: 'alice',
      requestMeta: { ip: '127.0.0.1', ua: 'vitest' },
    });

    expect(result.status_after).toBe('ASSIGNED');
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0][0].bound[1]).toBe('OUT');
    expect(db.batches[0][1].bound.slice(0, 6)).toEqual(['ASSIGNED', 5, 'E01', 'IT', 'Alice', '是']);
  });
});
