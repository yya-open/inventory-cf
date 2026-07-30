import { beforeEach, describe, expect, it, vi } from 'vitest';

// async-jobs.ts caches readiness in module-level state; a static import would share one cache
// across every case, so each case re-imports after vi.resetModules().
async function loadAsyncJobs() {
  vi.resetModules();
  return await import('../functions/api/services/async-jobs');
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

class FakeStatement {
  params: unknown[] = [];

  constructor(readonly sql: string, private readonly db: FakeAsyncJobsDb) {}

  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }

  async run() {
    this.db.record(this.sql);
    return { success: true, meta: { changes: 1 } };
  }

  async first() {
    this.db.record(this.sql);
    return this.db.jobRow;
  }

  async all() {
    this.db.record(this.sql);
    return { results: this.db.jobRow ? [this.db.jobRow] : [] };
  }
}

class FakeAsyncJobsDb {
  /** every SQL string handed to prepare(), whether executed standalone or inside a batch */
  readonly seen: string[] = [];
  /** one entry per batch() call, holding that batch's SQL strings in order */
  readonly batchSql: string[][] = [];
  jobRow: Record<string, unknown> | null = { id: 7, job_type: 'DASHBOARD_PRECOMPUTE', status: 'success' };

  /** name of the schema object the probe should report as missing */
  constructor(private readonly missingObject: string | null = null) {}

  prepare(sql: string) {
    return new FakeStatement(sql, this);
  }

  async batch(statements: FakeStatement[]) {
    this.batchSql.push(statements.map((statement) => statement.sql));
    return statements.map((statement) => {
      this.record(statement.sql);
      const ok = this.missingObject && statement.sql.includes(`'${this.missingObject}'`) ? 0 : 1;
      return { success: true, results: [{ ok }] };
    });
  }

  record(sql: string) {
    this.seen.push(sql);
  }

  /** schema-mutating statements: any of these on a job path is the regression we guard against */
  get ddl(): string[] {
    return this.seen.filter((sql) => sql.includes('CREATE ') || sql.includes('ALTER ') || sql.includes('DROP '));
  }

  get jobSelects(): string[] {
    return this.seen.map(normalizeSql).filter((sql) => sql === 'SELECT * FROM async_jobs WHERE id=?');
  }
}

describe('async_jobs readiness probe', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('reads a job with a read-only probe and zero DDL', async () => {
    const { getAsyncJob } = await loadAsyncJobs();
    const fake = new FakeAsyncJobsDb();
    // The fake only implements the D1 surface the service uses (prepare/bind/run/first/all/batch).
    const db = fake as unknown as D1Database;

    const row = await getAsyncJob(db, 7);

    expect(row).toEqual({ id: 7, job_type: 'DASHBOARD_PRECOMPUTE', status: 'success' });
    expect(fake.ddl).toEqual([]);
    expect(fake.batchSql).toHaveLength(1);
    expect(fake.batchSql[0].every((sql) => normalizeSql(sql).startsWith('SELECT 1 AS ok FROM'))).toBe(true);
    expect(fake.jobSelects).toHaveLength(1);
  });

  it('probes the table, the migration-added columns and the shipped indexes exactly once per isolate', async () => {
    const { getAsyncJob } = await loadAsyncJobs();
    const fake = new FakeAsyncJobsDb();
    // The fake only implements the D1 surface the service uses (prepare/bind/run/first/all/batch).
    const db = fake as unknown as D1Database;

    await getAsyncJob(db, 7);

    const probe = fake.batchSql[0].map(normalizeSql);
    expect(probe.filter((sql) => sql.includes("sqlite_master WHERE type='table' AND name='async_jobs'"))).toHaveLength(1);
    for (const column of [
      'result_blob_base64',
      'result_object_key',
      'result_file_size',
      'retry_count',
      'max_retries',
      'cancel_requested',
      'canceled_at',
      'retain_until',
      'result_deleted_at',
      'worker_token',
      'lease_until',
    ]) {
      expect(probe.some((sql) => sql === `SELECT 1 AS ok FROM pragma_table_info('async_jobs') WHERE name='${column}'`)).toBe(true);
    }
    for (const index of [
      'idx_async_jobs_status_created_at',
      'idx_async_jobs_created_by_status',
      'idx_async_jobs_retain_until',
      'idx_async_jobs_job_type_status_created_at',
      'idx_async_jobs_created_by_job_type_status',
    ]) {
      expect(probe.some((sql) => sql === `SELECT 1 AS ok FROM sqlite_master WHERE type='index' AND name='${index}'`)).toBe(true);
    }

    await getAsyncJob(db, 8);

    expect(fake.batchSql).toHaveLength(1);
    expect(fake.jobSelects).toHaveLength(2);
    expect(fake.ddl).toEqual([]);
  });

  it('still runs the query and emits no DDL when the probe reports a missing object', async () => {
    const { getAsyncJob } = await loadAsyncJobs();
    const fake = new FakeAsyncJobsDb('retain_until');
    // The fake only implements the D1 surface the service uses (prepare/bind/run/first/all/batch).
    const db = fake as unknown as D1Database;

    await getAsyncJob(db, 7);

    expect(fake.ddl).toEqual([]);
    expect(fake.jobSelects).toHaveLength(1);

    // Readiness stays uncached, but the TTL keeps the failed probe from repeating on the next call.
    await getAsyncJob(db, 7);

    expect(fake.batchSql).toHaveLength(1);
    expect(fake.jobSelects).toHaveLength(2);
    expect(fake.ddl).toEqual([]);
  });

  it('re-probes after the 10 minute TTL when readiness was never reached', async () => {
    const { getAsyncJob } = await loadAsyncJobs();
    const fake = new FakeAsyncJobsDb('idx_async_jobs_retain_until');
    // The fake only implements the D1 surface the service uses (prepare/bind/run/first/all/batch).
    const db = fake as unknown as D1Database;

    await getAsyncJob(db, 7);
    expect(fake.batchSql).toHaveLength(1);

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10 * 60_000 + 1);
    try {
      await getAsyncJob(db, 7);
    } finally {
      nowSpy.mockRestore();
    }

    expect(fake.batchSql).toHaveLength(2);
    expect(fake.ddl).toEqual([]);
  });
});
