import { describe, expect, it } from 'vitest';
import { buildWarningsQuery, listWarningsExportRows } from '../functions/api/services/inventory';

type Captured = { sql: string; binds: any[] };

class FakeStatement {
  binds: any[] = [];
  constructor(private captured: Captured[], private sql: string, private rows: any[]) {}

  bind(...params: any[]) {
    this.binds = params;
    return this;
  }

  async all<T = any>() {
    this.captured.push({ sql: this.sql, binds: this.binds });
    // Emulate LIMIT/OFFSET slicing when the SQL is paged.
    const hasLimit = /LIMIT \? OFFSET \?/.test(this.sql);
    if (!hasLimit) return { results: this.rows } as any;
    const limit = Number(this.binds[this.binds.length - 2] || 0);
    const offset = Number(this.binds[this.binds.length - 1] || 0);
    return { results: this.rows.slice(offset, offset + limit) } as any;
  }
}

class FakeDB {
  captured: Captured[] = [];
  constructor(private rows: any[]) {}

  prepare(sql: string) {
    return new FakeStatement(this.captured, sql, this.rows);
  }
}

function makeRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    sku: `SKU-${i + 1}`,
    name: `item ${i + 1}`,
    brand: 'b',
    model: 'm',
    category: 'c',
    qty: i,
    warning_qty: 100,
    gap: 100 - i,
    last_tx_at: '2026-01-01 00:00:00',
    last_tx_at_bj: '2026-01-01 08:00:00',
  }));
}

describe('listWarningsExportRows pagination', () => {
  it('omits LIMIT/OFFSET when no paging options are given', async () => {
    const db = new FakeDB(makeRows(3));
    const query = buildWarningsQuery(new URL('https://local/api/warnings/export?warehouse_id=1'));

    const rows = await listWarningsExportRows(db as any, query);

    expect(rows).toHaveLength(3);
    expect(db.captured).toHaveLength(1);
    expect(db.captured[0].sql).not.toContain('LIMIT ? OFFSET ?');
    // Only warehouse_id (x2) plus query binds — no paging binds appended.
    expect(db.captured[0].binds).toEqual([1, 1]);
  });

  it('appends LIMIT/OFFSET binds and returns the requested page', async () => {
    const db = new FakeDB(makeRows(2500));
    const query = buildWarningsQuery(new URL('https://local/api/warnings/export?warehouse_id=1'));

    const page = await listWarningsExportRows(db as any, query, { limit: 1000, offset: 1000 });

    expect(page).toHaveLength(1000);
    expect(page[0].sku).toBe('SKU-1001');
    expect(page[999].sku).toBe('SKU-2000');
    expect(db.captured[0].sql).toContain('LIMIT ? OFFSET ?');
    // warehouse_id (x2) then limit, offset.
    expect(db.captured[0].binds).toEqual([1, 1, 1000, 1000]);
  });
});
