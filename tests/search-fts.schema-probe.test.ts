import { describe, expect, it } from 'vitest';
import { ensureSearchFtsTables, rebuildSearchFtsTables } from '../functions/api/services/search-fts';

type ProbeCounts = {
  /** rows returned by the sqlite_master type='table' probe (1 = FTS virtual table exists) */
  ftsTableObjects: number;
  /** rows returned by the sqlite_master type='trigger' probe (3 = _ai/_au/_ad all exist) */
  ftsTriggerObjects: number;
  ftsRows: number;
  sourceRows: number;
};

// the read-path/ops-path full refill; trigger DDL also contains INSERT OR REPLACE but starts with CREATE TRIGGER
const REFILL_INSERT_SQL = /^INSERT OR REPLACE INTO \w+_fts\(/;

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

class FakeStatement {
  constructor(readonly sql: string, private readonly db: FakeSearchFtsDb) {}

  async run() {
    this.db.runs.push(this.sql);
    if (this.db.failRefill && REFILL_INSERT_SQL.test(normalizeSql(this.sql))) throw new Error('refill failed');
    return { success: true, meta: {} };
  }

  async first() {
    return { c: this.db.countFor(this.sql) };
  }
}

class FakeSearchFtsDb {
  /** every SQL string passed through prepare(...).run() */
  readonly runs: string[] = [];
  /** one entry per batch() call, holding that batch's SQL strings in order */
  readonly batchSql: string[][] = [];
  failRefill = false;

  constructor(private readonly counts: ProbeCounts) {}

  prepare(sql: string) {
    return new FakeStatement(sql, this);
  }

  async batch(statements: FakeStatement[]) {
    this.batchSql.push(statements.map((statement) => statement.sql));
    return statements.map((statement) => ({ success: true, results: [{ c: this.countFor(statement.sql) }] }));
  }

  countFor(sql: string): number {
    const normalized = normalizeSql(sql).toLowerCase();
    if (normalized.includes("from sqlite_master where type='table'")) return this.counts.ftsTableObjects;
    if (normalized.includes("from sqlite_master where type='trigger'")) return this.counts.ftsTriggerObjects;
    if (normalized.endsWith('_fts')) return this.counts.ftsRows;
    if (/from (pc_assets|monitor_assets|audit_log)$/.test(normalized)) return this.counts.sourceRows;
    throw new Error(`Unexpected count SQL: ${normalized}`);
  }

  /** schema-mutating statements: any of these on the read path is the regression we guard against */
  get ddlRuns(): string[] {
    return this.runs.filter((sql) => sql.includes('CREATE ') || sql.includes('DROP '));
  }

  get refillInserts(): string[] {
    return this.runs.filter((sql) => REFILL_INSERT_SQL.test(normalizeSql(sql)));
  }
}

// search-fts.ts keeps module-level ensuredKeys/ensurePromises shared across this whole file,
// so every test below owns a distinct FtsTableKey and the two 'audit' cases both end in a
// failed refill, which never caches readiness — the file stays order-insensitive.
describe('search FTS readiness probe', () => {
  it('probes once and runs no DDL when the FTS table and triggers already exist', async () => {
    const fake = new FakeSearchFtsDb({ ftsTableObjects: 1, ftsTriggerObjects: 3, ftsRows: 4, sourceRows: 5 });
    // The fake only implements the D1 methods the service under test uses (prepare/run/first/batch).
    const db = fake as unknown as D1Database;

    await ensureSearchFtsTables(db, ['pc']);

    expect(fake.batchSql).toHaveLength(1);
    expect(fake.batchSql[0]).toHaveLength(4);
    expect(fake.batchSql[0].every((sql) => normalizeSql(sql).startsWith('SELECT COUNT(*) AS c FROM'))).toBe(true);
    expect(fake.runs).toEqual([]);
    expect(fake.ddlRuns).toEqual([]);

    await ensureSearchFtsTables(db, ['pc']);

    expect(fake.batchSql).toHaveLength(1);
    expect(fake.runs).toEqual([]);
  });

  it('falls back to the compatibility DDL when the FTS objects are missing', async () => {
    const fake = new FakeSearchFtsDb({ ftsTableObjects: 0, ftsTriggerObjects: 0, ftsRows: 0, sourceRows: 0 });
    // The fake only implements the D1 methods the service under test uses (prepare/run/first/batch).
    const db = fake as unknown as D1Database;

    await ensureSearchFtsTables(db, ['monitor']);

    expect(fake.batchSql).toHaveLength(1);
    const created = fake.runs.map(normalizeSql);
    expect(created.some((sql) => sql.startsWith('CREATE VIRTUAL TABLE IF NOT EXISTS monitor_assets_fts USING fts5('))).toBe(true);
    expect(created.some((sql) => sql.startsWith('CREATE TRIGGER monitor_assets_fts_ai AFTER INSERT ON monitor_assets'))).toBe(true);
    expect(created.some((sql) => sql.startsWith('CREATE TRIGGER monitor_assets_fts_au AFTER UPDATE ON monitor_assets'))).toBe(true);
    expect(created.some((sql) => sql.startsWith('CREATE TRIGGER monitor_assets_fts_ad AFTER DELETE ON monitor_assets'))).toBe(true);
    expect(fake.refillInserts).toEqual([]);
  });

  it('attempts a refill without any DDL when the objects exist but the FTS table is empty', async () => {
    const fake = new FakeSearchFtsDb({ ftsTableObjects: 1, ftsTriggerObjects: 3, ftsRows: 0, sourceRows: 12 });
    // The fake only implements the D1 methods the service under test uses (prepare/run/first/batch).
    const db = fake as unknown as D1Database;
    fake.failRefill = true;

    await expect(ensureSearchFtsTables(db, ['audit'])).rejects.toThrow('refill failed');

    expect(fake.batchSql).toHaveLength(1);
    expect(fake.runs.map(normalizeSql)[0]).toBe('DELETE FROM audit_log_fts');
    expect(fake.refillInserts).toHaveLength(1);
    expect(normalizeSql(fake.refillInserts[0])).toContain('INSERT OR REPLACE INTO audit_log_fts(rowid,');
    expect(normalizeSql(fake.refillInserts[0])).toContain('FROM audit_log');
    expect(fake.ddlRuns).toEqual([]);
  });

  it('does not cache readiness when an explicit rebuild fails during refill', async () => {
    const fake = new FakeSearchFtsDb({ ftsTableObjects: 1, ftsTriggerObjects: 3, ftsRows: 0, sourceRows: 12 });
    // The fake only implements the D1 methods the service under test uses (prepare/run/first/batch).
    const db = fake as unknown as D1Database;
    fake.failRefill = true;

    await expect(rebuildSearchFtsTables(db, ['audit'])).rejects.toThrow('refill failed');

    expect(fake.batchSql).toEqual([]);
    expect(fake.ddlRuns.length).toBeGreaterThan(0);
    expect(fake.refillInserts).toHaveLength(1);

    await expect(ensureSearchFtsTables(db, ['audit'])).rejects.toThrow('refill failed');

    expect(fake.batchSql).toHaveLength(1);
    expect(fake.refillInserts).toHaveLength(2);
  });
});
