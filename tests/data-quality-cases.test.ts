import { describe, expect, it, vi } from 'vitest';

const { runDataIntegrityChecks } = vi.hoisted(() => ({
  runDataIntegrityChecks: vi.fn(),
}));

vi.mock('../functions/api/services/data-integrity', () => ({ runDataIntegrityChecks }));

import { scanDataQualityCases } from '../functions/api/services/data-quality-cases';

class FakeStatement {
  private params: any[] = [];

  constructor(private db: FakeDB, private sql: string) {}

  bind(...params: any[]) {
    this.params = params;
    return this;
  }

  async run() {
    return this.db.execute(this.sql, this.params);
  }
}

class FakeDB {
  readonly sql: string[] = [];

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  async batch(statements: Array<{ run: () => Promise<any> }>) {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  execute(sql: string, _params: any[]) {
    this.sql.push(sql);
    return {
      success: true,
      meta: { changes: sql.includes("SET status='resolved'") ? 2 : 1 },
    } as any;
  }
}

describe('data quality cases', () => {
  it('resolves previously open cases missing from the latest scan', async () => {
    runDataIntegrityChecks.mockResolvedValue({
      ok: false,
      issue_count: 1,
      issues: [{ key: 'negative_stock_qty', severity: 'error', table: 'stock', message: 'negative quantity', count: 1, sample: [{ id: 3 }] }],
    });
    const db = new FakeDB();

    const result = await scanDataQualityCases(db as any);
    const resolutionSql = db.sql.find((sql) => sql.includes("SET status='resolved'")) || '';

    expect(result.scanned_cases).toBe(1);
    expect(result.resolved_cases).toBe(2);
    expect(resolutionSql).toContain("status IN ('open', 'in_progress')");
    expect(resolutionSql).toContain('issue_key NOT IN (?)');
    expect(resolutionSql).not.toContain('ignored');
  });
});
