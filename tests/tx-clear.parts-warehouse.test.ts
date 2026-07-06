import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('tx clear parts warehouse guard', () => {
  it('always limits stock transaction deletion to the resolved parts warehouse', () => {
    const source = readFileSync(resolve(process.cwd(), 'functions/api/tx/clear.ts'), 'utf8');
    const normalized = source.replace(/\s+/g, ' ');

    expect(normalized).toContain('const allowedWarehouseId = await assertPartsWarehouseAccess');
    expect(normalized).toContain('wh.push("warehouse_id=?")');
    expect(normalized).toContain('binds.push(allowedWarehouseId)');
    expect(normalized).toContain('mode === "all" ? { warehouse_id: allowedWarehouseId }');
    expect(normalized).not.toContain('mode === "all" ? null');
  });
});
