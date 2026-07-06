import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('bulk warning parts warehouse guard', () => {
  it('uses the resolved parts warehouse id when deriving warning qty from stock', () => {
    const source = readFileSync(resolve(process.cwd(), 'functions/api/items/bulk-warning.ts'), 'utf8');
    const normalized = source.replace(/\s+/g, ' ');

    expect(normalized).toContain('const allowedWarehouseId = await assertPartsWarehouseAccess');
    expect(normalized).toContain('binds = [allowedWarehouseId, delta, ...item_ids]');
    expect(normalized).not.toContain('binds = [warehouse_id, delta, ...item_ids]');
  });
});
