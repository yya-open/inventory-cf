import { describe, expect, it } from 'vitest';
import { buildRestoreVerification, runDataIntegrityChecks } from '../functions/api/services/data-integrity';
import type { BackupManifest } from '../functions/api/admin/_backup_integrity';

class FakeStatement {
  private params: any[] = [];

  constructor(private db: FakeDB, private sql: string) {}

  bind(...params: any[]) {
    this.params = params;
    return this;
  }

  async all<T = any>() {
    return { results: this.db.execute(this.sql, this.params) as T[] } as any;
  }

  async first<T = any>() {
    const rows = this.db.execute(this.sql, this.params);
    return Array.isArray(rows) ? (rows[0] ?? null) as T : rows as T;
  }
}

class FakeDB {
  constructor(private rows: Record<string, any[]>) {}

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  execute(sql: string, params: any[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized === "select id, username from users where trim(coalesce(username, '')) = '' limit ?") {
      return (this.rows.blankUsers || []).slice(0, Number(params[0] || 5));
    }
    if (normalized.startsWith('select id, username, data_scope_type, data_scope_value, data_scope_value2 from users where not')) {
      return (this.rows.invalidScopes || []).slice(0, Number(params[0] || 5));
    }
    if (normalized === 'select id, item_id, warehouse_id, qty from stock where coalesce(qty, 0) < 0 limit ?') {
      return (this.rows.negativeStock || []).slice(0, Number(params[0] || 5));
    }
    if (normalized === "select id, serial_no, brand, model from pc_assets where trim(coalesce(serial_no, '')) = '' limit ?") {
      return (this.rows.blankPcSerial || []).slice(0, Number(params[0] || 5));
    }
    if (normalized === "select id, asset_code, sn, brand, model from monitor_assets where trim(coalesce(asset_code, '')) = '' limit ?") {
      return (this.rows.blankMonitorCode || []).slice(0, Number(params[0] || 5));
    }
    if (normalized === 'select s.asset_id from pc_asset_latest_state s left join pc_assets a on a.id = s.asset_id where a.id is null limit ?') {
      return (this.rows.orphanPcLatest || []).slice(0, Number(params[0] || 5));
    }
    if (normalized === 'select t.id, t.asset_id, t.tx_no from monitor_tx t left join monitor_assets a on a.id = t.asset_id where a.id is null limit ?') {
      return (this.rows.orphanMonitorTx || []).slice(0, Number(params[0] || 5));
    }
    if (normalized === 'pragma foreign_key_check') {
      return this.rows.foreignKeyCheck || [];
    }
    if (normalized === 'pragma quick_check') {
      return this.rows.quickCheck || [{ quick_check: 'ok' }];
    }
    if (normalized.startsWith('select count(*) as c from pc_assets')) {
      return [{ c: Number(this.rows.pcAssetCount?.[0]?.c || 0) }];
    }
    if (normalized.startsWith('select count(*) as c from monitor_assets')) {
      return [{ c: Number(this.rows.monitorAssetCount?.[0]?.c || 0) }];
    }
    throw new Error(`Unhandled SQL: ${sql}`);
  }
}

describe('data integrity helpers', () => {
  it('detects integrity issues from the database', async () => {
    const db = new FakeDB({
      blankUsers: [{ id: 1, username: '' }],
      invalidScopes: [{ id: 2, username: 'viewer', data_scope_type: 'department', data_scope_value: '', data_scope_value2: '显示器仓' }],
      negativeStock: [{ id: 3, item_id: 9, warehouse_id: 1, qty: -1 }],
      blankPcSerial: [{ id: 4, serial_no: '', brand: 'A', model: 'B' }],
      blankMonitorCode: [],
      orphanPcLatest: [],
      orphanMonitorTx: [{ id: 7, asset_id: 999, tx_no: 'TX-1' }],
      foreignKeyCheck: [{ table: 'monitor_tx', rowid: 7 }],
      quickCheck: [{ quick_check: 'ok' }],
    }) as any;

    const result = await runDataIntegrityChecks(db);

    expect(result.ok).toBe(false);
    expect(result.issue_count).toBeGreaterThanOrEqual(4);
    expect(result.checks.foreign_key_ok).toBe(false);
    expect(result.issues.some((item) => item.key === 'blank_username')).toBe(true);
    expect(result.issues.some((item) => item.key === 'negative_stock_qty')).toBe(true);
  });

  it('verifies replace restore row counts against manifest', async () => {
    const db = new FakeDB({
      pcAssetCount: [{ c: 2 }],
      monitorAssetCount: [{ c: 1 }],
      quickCheck: [{ quick_check: 'ok' }],
      foreignKeyCheck: [],
    }) as any;

    const manifest: BackupManifest = {
      backup_version: 'inventory-cf-backup-v3',
      schema_version: 3,
      exported_at: '2026-04-21T00:00:00.000Z',
      generated_by: 'test',
      actor: 'tester',
      reason: 'unit',
      filters: null,
      table_order: ['pc_assets', 'monitor_assets'],
      table_count: 2,
      total_rows: 3,
      tables: {
        pc_assets: { group: 'pc', group_label: '电脑仓', label: '电脑台账', columns: ['id'], rows: 2 },
        monitor_assets: { group: 'monitor', group_label: '显示器', label: '显示器台账', columns: ['id'], rows: 1 },
      },
    };

    const result = await buildRestoreVerification(db, {
      mode: 'replace',
      manifest,
      tableOrder: ['pc_assets', 'monitor_assets'],
      processedRows: 3,
      totalRows: 3,
    });

    expect(result.ok).toBe(true);
    expect(result.row_checks).toHaveLength(2);
    expect(result.row_checks.every((item) => item.ok)).toBe(true);
  });
});
