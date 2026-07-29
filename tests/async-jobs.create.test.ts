import { describe, expect, it } from 'vitest';
import { createAsyncJob, createAsyncJobs } from '../functions/api/services/async-jobs';

class InsertOnlyStatement {
  private params: unknown[] = [];

  constructor(
    private readonly db: InsertOnlyDB,
    private readonly sql: string,
  ) {}

  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }

  async run() {
    return this.db.execute(this.sql, this.params);
  }
}

class InsertOnlyDB {
  readonly statements: string[] = [];
  private nextId = 1;

  prepare(sql: string) {
    return new InsertOnlyStatement(this, sql);
  }

  async batch(statements: InsertOnlyStatement[]) {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  execute(sql: string, params: unknown[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalized.startsWith('insert into async_jobs')) {
      throw new Error(`Task creation executed non-insert SQL: ${normalized}`);
    }
    this.statements.push(normalized);
    expect(params[0]).toBeTruthy();
    return { success: true, meta: { last_row_id: this.nextId++ } } as any;
  }
}

describe('async job creation hot path', () => {
  it('creates one job without synchronous housekeeping', async () => {
    const db = new InsertOnlyDB();

    const id = await createAsyncJob(db as any, {
      job_type: 'DASHBOARD_PRECOMPUTE',
      created_by: 7,
      request_json: { force: true },
    });

    expect(id).toBe(1);
    expect(db.statements).toHaveLength(1);
  });

  it('creates job batches without synchronous housekeeping', async () => {
    const db = new InsertOnlyDB();

    const ids = await createAsyncJobs(db as any, [
      { job_type: 'PC_QR_CARDS_EXPORT', request_json: { ids: [1] } },
      { job_type: 'PC_QR_CARDS_EXPORT', request_json: { ids: [2] } },
    ]);

    expect(ids).toEqual([1, 2]);
    expect(db.statements).toHaveLength(2);
  });
});
