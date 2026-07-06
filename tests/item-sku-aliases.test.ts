import { describe, expect, it } from 'vitest';
import { aliasInsertStatement, resolveItemsBySkuOrAlias } from '../functions/api/services/item-sku-aliases';

class FakeStatement {
  private params: any[] = [];

  constructor(
    private sql: string,
    private items: Array<{ id: number; sku: string; enabled?: number }>,
    private aliases: Array<{ item_id: number; alias_sku: string; active?: number }>,
  ) {}

  bind(...params: any[]) {
    this.params = params;
    return this;
  }

  async all<T = any>() {
    if (this.sql.includes('FROM items') && this.sql.includes('sku IN')) {
      const enabledOnly = this.sql.includes('enabled=1');
      return {
        results: this.items
          .filter((item) => (!enabledOnly || item.enabled !== 0) && this.params.includes(item.sku))
          .map((item) => ({ input_sku: item.sku, id: item.id, sku: item.sku, enabled: item.enabled ?? 1, matched_by: 'sku' })) as T[],
      };
    }
    if (this.sql.includes('FROM item_sku_aliases')) {
      return {
        results: this.aliases
          .filter((alias) => alias.active !== 0 && this.params.includes(alias.alias_sku))
          .map((alias) => {
            const item = this.items.find((candidate) => candidate.id === alias.item_id && candidate.enabled !== 0);
            if (!item) return null;
            return { input_sku: alias.alias_sku, id: item.id, sku: item.sku, matched_by: 'alias' };
          })
          .filter(Boolean) as T[],
      };
    }
    return { results: [] as T[] };
  }
}

class FakeDB {
  constructor(
    private items: Array<{ id: number; sku: string; enabled?: number }>,
    private aliases: Array<{ item_id: number; alias_sku: string; active?: number }>,
  ) {}

  prepare(sql: string) {
    return new FakeStatement(sql, this.items, this.aliases);
  }

  async batch() {
    return [];
  }
}

describe('item SKU aliases', () => {
  it('resolves direct SKUs and legacy aliases to canonical item SKUs', async () => {
    const db = new FakeDB(
      [
        { id: 1, sku: 'CPU-20260706-001' },
        { id: 2, sku: 'RAM-20260706-001' },
      ],
      [{ item_id: 1, alias_sku: 'cpu001' }],
    );

    const result = await resolveItemsBySkuOrAlias(db as any, ['CPU-20260706-001', 'cpu001', 'missing']);

    expect(result.get('CPU-20260706-001')).toMatchObject({ id: 1, sku: 'CPU-20260706-001', matched_by: 'sku' });
    expect(result.get('cpu001')).toMatchObject({ id: 1, sku: 'CPU-20260706-001', matched_by: 'alias' });
    expect(result.has('missing')).toBe(false);
  });

  it('uses a strict insert for alias preservation so conflicts cannot be ignored', () => {
    let capturedSql = '';
    const db = {
      prepare(sql: string) {
        capturedSql = sql;
        return {
          bind() {
            return this;
          },
        };
      },
    };

    aliasInsertStatement(db as any, { item_id: 1, alias_sku: 'cpu001' });

    expect(capturedSql).toContain('INSERT INTO item_sku_aliases');
    expect(capturedSql).not.toContain('OR IGNORE');
  });

  it('can include disabled direct SKU matches for import upserts', async () => {
    const db = new FakeDB(
      [{ id: 1, sku: 'SSD-1T-NVME', enabled: 0 }],
      [],
    );

    const defaultResult = await resolveItemsBySkuOrAlias(db as any, ['SSD-1T-NVME']);
    const importResult = await resolveItemsBySkuOrAlias(db as any, ['SSD-1T-NVME'], { includeDisabledDirect: true });

    expect(defaultResult.has('SSD-1T-NVME')).toBe(false);
    expect(importResult.get('SSD-1T-NVME')).toMatchObject({ id: 1, sku: 'SSD-1T-NVME', matched_by: 'sku' });
  });
});
