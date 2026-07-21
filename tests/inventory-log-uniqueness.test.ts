import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

describe('inventory log concurrency guards', () => {
  it('deduplicates historical logs before adding partial unique indexes', () => {
    const sql = fs.readFileSync(path.join(root, 'sql', 'migrate_inventory_log_unique_and_data_quality.sql'), 'utf8');
    expect(sql).toContain('DELETE FROM pc_inventory_log');
    expect(sql).toContain('DELETE FROM monitor_inventory_log');
    expect(sql).toContain('uq_pc_inventory_log_batch_asset');
    expect(sql).toContain('uq_monitor_inventory_log_batch_asset');
    expect(sql).toContain('WHERE batch_id IS NOT NULL');
  });

  it('writes public inventory logs and asset state in one D1 batch', () => {
    const source = fs.readFileSync(path.join(root, 'functions', 'api', 'services', 'public-assets.ts'), 'utf8');
    expect(source).toContain('await db.batch([');
    expect(source).toContain('ON CONFLICT(batch_id, asset_id) WHERE batch_id IS NOT NULL DO UPDATE');
    expect(source).toContain("WHERE excluded.action='ISSUE'");
    expect(source).toContain('SELECT UPPER(action) FROM ${table} WHERE asset_id=? AND batch_id=? LIMIT 1');
    expect(source).toContain("normalized === 'OK' && changes === 0");
  });

  it('does not run inventory schema DDL or implicit log cleanup on requests', () => {
    const source = fs.readFileSync(path.join(root, 'functions', 'api', 'services', 'asset-inventory-batches.ts'), 'utf8');
    expect(source).not.toContain('CREATE TABLE IF NOT EXISTS asset_inventory_batch');
    expect(source).not.toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_pc_inventory_log_batch_asset');
    expect(source).not.toContain('DELETE FROM pc_inventory_log\n       WHERE batch_id IS NOT NULL');
  });
});
