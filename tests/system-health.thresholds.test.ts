import { describe, expect, it, vi } from 'vitest';

vi.mock('../functions/_permissions', () => ({
  requirePermission: vi.fn(async () => ({ id: 1, username: 'admin', role: 'admin' })),
}));

vi.mock('../functions/api/services/schema-status', () => ({
  getSchemaStatus: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../functions/api/services/ops-tools', () => ({
  ensureRequestErrorLogTable: vi.fn(async () => {}),
  ensureAdminRepairHistoryTable: vi.fn(async () => {}),
  getAutoRepairScan: vi.fn(async () => ({ total_problem_count: 0 })),
}));

vi.mock('../functions/api/services/async-jobs', () => ({
  ensureAsyncJobsTable: vi.fn(async () => {}),
}));

vi.mock('../functions/api/services/system-settings', () => ({
  getSystemSettings: vi.fn(async () => ({
    alert_threshold_error_5xx_last_24h: 5,
    alert_threshold_failed_async_jobs: 10,
    alert_threshold_login_failures_last_24h: 15,
  })),
}));

import { onRequestGet as healthHandler } from '../functions/api/system-health';

class FakeStmt {
  private params: any[] = [];
  constructor(private db: FakeDB, private sql: string) {}
  bind(...params: any[]) {
    this.params = params;
    return this;
  }
  async first<T = any>() {
    return this.db.first(this.sql, this.params) as T;
  }
}

class FakeDB {
  prepare(sql: string) {
    return new FakeStmt(this, sql);
  }
  first(sql: string, _params: any[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.includes("from pc_assets")) return { c: 100 };
    if (normalized.includes("from pc_asset_latest_state") && !normalized.includes('left join')) return { c: 95 };
    if (normalized.includes('from dictionary_usage_counters')) return { c: 20 };
    if (normalized.includes("from async_jobs where status='failed'")) return { c: 12 };
    if (normalized.includes('from request_error_log') && normalized.includes('status >= 500')) return { c: 7 };
    if (normalized.includes('from auth_login_throttle')) return { c: 16 };
    if (normalized.includes('from admin_repair_history')) return null;
    if (normalized.includes('from backup_drill_runs order by')) return null;
    if (normalized.includes("from backup_drill_runs where follow_up_status='open' and")) return { c: 0 };
    if (normalized.includes("from backup_drill_runs where follow_up_status='open'")) return { c: 0 };
    if (normalized.includes('left join pc_asset_latest_state')) return { c: 5 };
    throw new Error(`Unhandled SQL: ${sql}`);
  }
}

describe('system-health thresholds', () => {
  it('returns configured thresholds and breach flags', async () => {
    const env = { DB: new FakeDB(), JWT_SECRET: 'test' } as any;
    const response = await healthHandler({ env, request: new Request('https://example.com/api/system-health?force=1') } as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.metrics.thresholds).toEqual({
      failed_async_jobs: 10,
      error_5xx_last_24h: 5,
      login_failures_last_24h: 15,
    });
    expect(body.data.alerts.threshold_breaches).toEqual({
      failed_jobs: true,
      error_5xx_last_24h: true,
      login_failures_last_24h: true,
    });
  });
});
