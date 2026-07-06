import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('pc batch inbound asset linkage', () => {
  it('does not depend on last_insert_rowid for new asset linkage across batch chunks', () => {
    const source = readFileSync(resolve(process.cwd(), 'functions/api/pc-in-batch.ts'), 'utf8');
    const normalized = source.replace(/\s+/g, ' ');

    expect(normalized).not.toContain('VALUES (?, last_insert_rowid()');
    expect(normalized).not.toContain('INSERT INTO pc_asset_latest_state (asset_id, last_in_id, updated_at) VALUES (last_insert_rowid()');
    expect(normalized).not.toContain('statements.slice(');
    expect(normalized).toContain('(SELECT id FROM pc_assets WHERE UPPER(TRIM(serial_no))=? LIMIT 1)');
    expect(normalized).toContain('(SELECT asset_id FROM pc_in WHERE in_no=? LIMIT 1)');
    expect(normalized).toContain('(SELECT id FROM pc_in WHERE in_no=? LIMIT 1)');
    expect(normalized).toContain('const processedSerials = new Set<string>()');
    expect(normalized).toContain('processedSerials.has(serial_no)');
  });
});
