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
    // Consolidated health aggregate: one round trip returning every scalar metric as a named column.
    if (normalized.includes('as pc_asset_count')) {
      return {
        pc_asset_count: 100,
        pc_latest_state_count: 95,
        dictionary_counter_rows: 20,
        failed_async_jobs: 12,
        error_5xx_last_24h: 7,
        login_failures_last_24h: 16,
        open_backup_drill_issue_count: 0,
        overdue_backup_drill_issue_count: 0,
        pc_latest_state_missing: 5,
      };
    }
    if (normalized.includes('from admin_repair_history')) return null;
    if (normalized.includes('from backup_drill_runs order by')) return null;
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

class FallbackFakeStmt {
  private params: any[] = [];
  constructor(private db: FallbackFakeDB, private sql: string) {}
  bind(...params: any[]) {
    this.params = params;
    return this;
  }
  async first<T = any>() {
    return this.db.first(this.sql, this.params) as T;
  }
}

// Models a partially-migrated database: the consolidated aggregate query fails (a referenced table
// is missing), forcing the handler to fall back to per-metric queries. One missing table must not
// zero out the others.
class FallbackFakeDB {
  prepare(sql: string) {
    return new FallbackFakeStmt(this, sql);
  }
  first(sql: string, _params: any[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.includes('as pc_asset_count')) {
      throw new Error('no such table: pc_asset_latest_state');
    }
    if (normalized.includes("from pc_assets where") || normalized.includes('left join pc_asset_latest_state')) {
      throw new Error('no such table: pc_asset_latest_state');
    }
    if (normalized.includes('from pc_asset_latest_state')) {
      throw new Error('no such table: pc_asset_latest_state');
    }
    if (normalized.includes('from pc_assets')) return { v: 100 };
    if (normalized.includes('from dictionary_usage_counters')) return { v: 20 };
    if (normalized.includes("from async_jobs where status='failed'")) return { v: 12 };
    if (normalized.includes('from request_error_log') && normalized.includes('status >= 500')) return { v: 7 };
    if (normalized.includes('from auth_login_throttle')) return { v: 16 };
    if (normalized.includes('from backup_drill_runs where follow_up_status=\'open\' and')) return { v: 0 };
    if (normalized.includes("from backup_drill_runs where follow_up_status='open'")) return { v: 0 };
    if (normalized.includes('from admin_repair_history')) return null;
    if (normalized.includes('from backup_drill_runs order by')) return null;
    throw new Error(`Unhandled SQL: ${sql}`);
  }
}

describe('system-health aggregate fallback', () => {
  it('falls back to per-metric queries when the consolidated query fails', async () => {
    const env = { DB: new FallbackFakeDB(), JWT_SECRET: 'test' } as any;
    const response = await healthHandler({ env, request: new Request('https://example.com/api/system-health?force=1') } as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    // Surviving tables still report real counts.
    expect(body.data.metrics.pc_asset_count).toBe(100);
    expect(body.data.metrics.dictionary_counter_rows).toBe(20);
    expect(body.data.metrics.failed_async_jobs).toBe(12);
    expect(body.data.metrics.error_5xx_last_24h).toBe(7);
    expect(body.data.metrics.login_failures_last_24h).toBe(16);
    // The missing table zeroes only its own metrics, not the rest.
    expect(body.data.metrics.pc_latest_state_count).toBe(0);
    expect(body.data.metrics.pc_latest_state_missing).toBe(0);
  });
});
