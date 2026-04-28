import { describe, expect, it, vi } from 'vitest';
import { setUserPermissions } from '../functions/_permissions';

class FakeStmt {
  private params: any[] = [];
  constructor(private db: FakePermDB, private sql: string) {}
  bind(...params: any[]) {
    this.params = params;
    return this;
  }
  async all<T = any>() {
    return { results: this.db.execute(this.sql, this.params, 'all') as T[] };
  }
  async run() {
    this.db.execute(this.sql, this.params, 'run');
    return { success: true } as any;
  }
}

class FakePermDB {
  rows: Array<{ permission_code: string; allowed: number }> = [];
  batchCount = 0;
  prepare(sql: string) {
    return new FakeStmt(this, sql);
  }
  async batch(statements: Array<{ run: () => Promise<any> }>) {
    this.batchCount += statements.length;
    for (const s of statements) await s.run();
    return [];
  }
  execute(sql: string, params: any[], mode: 'all' | 'run') {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.startsWith('create table if not exists user_permissions')) return mode === 'all' ? [] : null;
    if (normalized.startsWith('select permission_code, allowed from user_permissions where user_id=?')) return this.rows;
    if (normalized.startsWith('insert into user_permissions')) {
      const code = String(params[1]);
      const allowed = Number(params[2]) === 1 ? 1 : 0;
      const idx = this.rows.findIndex((r) => r.permission_code === code);
      if (idx >= 0) this.rows[idx].allowed = allowed;
      else this.rows.push({ permission_code: code, allowed });
      return null;
    }
    throw new Error(`Unhandled SQL: ${sql}`);
  }
}

describe('setUserPermissions delta write', () => {
  it('skips writes when values do not change', async () => {
    const db = new FakePermDB();
    db.rows = [{ permission_code: 'audit_export', allowed: 1 }];
    await setUserPermissions(db as any, 2, { audit_export: true }, 'admin');
    expect(db.batchCount).toBe(0);
  });

  it('writes only changed permission items', async () => {
    const db = new FakePermDB();
    db.rows = [
      { permission_code: 'audit_export', allowed: 1 },
      { permission_code: 'bulk_operation', allowed: 0 },
    ];
    await setUserPermissions(db as any, 2, { audit_export: false, bulk_operation: false }, 'admin');
    expect(db.batchCount).toBe(1);
    expect(db.rows.find((r) => r.permission_code === 'audit_export')?.allowed).toBe(0);
    expect(db.rows.find((r) => r.permission_code === 'bulk_operation')?.allowed).toBe(0);
  });
});
