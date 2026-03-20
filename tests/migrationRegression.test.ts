import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('latest optimization migration bundle', () => {
  const sql = fs.readFileSync('sql/migrate_snapshot_counters_search_atomic_settings.sql', 'utf8');

  it('creates latest-state snapshot and dictionary counter tables', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS pc_asset_latest_state');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS dictionary_usage_counters');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS system_settings_meta');
  });

  it('keeps snapshot cascade semantics', () => {
    expect(sql).toContain('FOREIGN KEY(asset_id) REFERENCES pc_assets(id) ON DELETE CASCADE');
  });
});
