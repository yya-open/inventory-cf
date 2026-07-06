import { describe, expect, it } from 'vitest';
import {
  analyzeItemSku,
  precheckSkuGovernanceUpdates,
  scanItemSkuGovernance,
  validateGovernanceSku,
} from '../functions/api/services/item-sku-governance';

class FakeStatement {
  constructor(private rows: any[]) {}

  bind() {
    return this;
  }

  async all<T = any>() {
    return { results: this.rows as T[] };
  }
}

class FakeDB {
  constructor(private rows: any[]) {}

  prepare() {
    return new FakeStatement(this.rows);
  }
}

class PrecheckStatement {
  private params: any[] = [];

  constructor(
    private sql: string,
    private items: Array<{ id: number; sku: string; name?: string; enabled?: number }>,
    private aliases: Array<{ item_id: number; alias_sku: string; active?: number }>,
  ) {}

  bind(...params: any[]) {
    this.params = params;
    return this;
  }

  async all<T = any>() {
    if (this.sql.includes('SELECT id, sku, name FROM items')) {
      return {
        results: this.items
          .filter((item) => item.enabled !== 0 && this.params.includes(item.id))
          .map((item) => ({ id: item.id, sku: item.sku, name: item.name || null })) as T[],
      };
    }
    if (this.sql.includes('SELECT id, sku FROM items')) {
      const midpoint = Math.floor(this.params.length / 2);
      const newSkus = this.params.slice(0, midpoint);
      const ids = this.params.slice(midpoint);
      return {
        results: this.items
          .filter((item) => item.enabled !== 0 && newSkus.includes(item.sku) && !ids.includes(item.id))
          .map((item) => ({ id: item.id, sku: item.sku })) as T[],
      };
    }
    if (this.sql.includes('FROM item_sku_aliases') && !this.sql.includes('item_id NOT IN')) {
      return {
        results: this.aliases
          .filter((alias) => alias.active !== 0 && this.params.includes(alias.alias_sku))
          .map((alias) => ({ item_id: alias.item_id, alias_sku: alias.alias_sku })) as T[],
      };
    }
    if (this.sql.includes('FROM item_sku_aliases')) {
      const midpoint = Math.floor(this.params.length / 2);
      const newSkus = this.params.slice(0, midpoint);
      const ids = this.params.slice(midpoint);
      return {
        results: this.aliases
          .filter((alias) => alias.active !== 0 && newSkus.includes(alias.alias_sku) && !ids.includes(alias.item_id))
          .map((alias) => ({ item_id: alias.item_id, alias_sku: alias.alias_sku })) as T[],
      };
    }
    return { results: [] as T[] };
  }
}

class PrecheckDB {
  constructor(
    private items: Array<{ id: number; sku: string; name?: string; enabled?: number }>,
    private aliases: Array<{ item_id: number; alias_sku: string; active?: number }> = [],
  ) {}

  prepare(sql: string) {
    return new PrecheckStatement(sql, this.items, this.aliases);
  }

  async batch() {
    return [];
  }
}

describe('item SKU governance', () => {
  it('classifies risky and legacy SKU formats separately', () => {
    expect(analyzeItemSku('cpu001').severity).toBe('risk');
    expect(analyzeItemSku('CPU-001').severity).toBe('legacy');
    expect(analyzeItemSku('CPU-20260706-001').isCompliant).toBe(true);
  });

  it('validates edited governance SKU values', () => {
    expect(validateGovernanceSku('CPU-20260706-001')).toBeNull();
    expect(validateGovernanceSku('cpu-001')).toContain('只能包含');
    expect(validateGovernanceSku('CPU/001')).toContain('只能包含');
  });

  it('scans enabled items and generates unique suggestions', async () => {
    const db = new FakeDB([
      { id: 1, sku: 'cpu001', name: 'CPU i5', brand: 'Intel', model: '12400F', category: 'CPU', unit: '个' },
      { id: 2, sku: 'CPU-20260706-001', name: 'CPU i7', brand: 'Intel', model: '12700', category: 'CPU', unit: '个' },
      { id: 3, sku: '网线2米', name: '网线2米', brand: null, model: null, category: '线材', unit: '条' },
    ]);

    const result = await scanItemSkuGovernance(db as any, { severity: 'all', limit: 50 });

    expect(result.summary.total).toBe(3);
    expect(result.summary.compliant).toBe(1);
    expect(result.summary.risk).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(new Set(result.items.map((item) => item.suggested_sku)).size).toBe(2);
  });

  it('prechecks governance updates and reports alias creation', async () => {
    const db = new PrecheckDB([{ id: 1, sku: 'cpu001', name: 'CPU i5' }]);

    const report = await precheckSkuGovernanceUpdates(db as any, [{
      id: 1,
      old_sku: 'cpu001',
      new_sku: 'CPU-20260706-001',
      suggested_sku: 'CPU-20260706-002',
    }]);

    expect(report.ok).toBe(true);
    expect(report.valid_count).toBe(1);
    expect(report.alias_to_create_count).toBe(1);
    expect(report.manually_changed_count).toBe(1);
    expect(report.warnings.map((warning) => warning.code)).toContain('aliases_created');
  });

  it('prevents governance updates that collide with another item alias', async () => {
    const db = new PrecheckDB(
      [{ id: 1, sku: 'cpu001', name: 'CPU i5' }],
      [{ item_id: 2, alias_sku: 'CPU-20260706-001' }],
    );

    const report = await precheckSkuGovernanceUpdates(db as any, [{
      id: 1,
      old_sku: 'cpu001',
      new_sku: 'CPU-20260706-001',
      suggested_sku: 'CPU-20260706-001',
    }]);

    expect(report.ok).toBe(false);
    expect(report.errors.map((error) => error.code)).toContain('sku_conflict_alias');
  });

  it('prevents preserving an old SKU that is already another active item alias', async () => {
    const db = new PrecheckDB(
      [{ id: 1, sku: 'cpu001', name: 'CPU i5' }],
      [{ item_id: 2, alias_sku: 'cpu001' }],
    );

    const report = await precheckSkuGovernanceUpdates(db as any, [{
      id: 1,
      old_sku: 'cpu001',
      new_sku: 'CPU-20260706-001',
      suggested_sku: 'CPU-20260706-001',
    }]);

    expect(report.ok).toBe(false);
    expect(report.errors.map((error) => error.code)).toContain('old_sku_alias_conflict');
  });

  it('marks an old SKU alias that is already active for the same item as preserved', async () => {
    const db = new PrecheckDB(
      [{ id: 1, sku: 'cpu001', name: 'CPU i5' }],
      [{ item_id: 1, alias_sku: 'cpu001' }],
    );

    const report = await precheckSkuGovernanceUpdates(db as any, [{
      id: 1,
      old_sku: 'cpu001',
      new_sku: 'CPU-20260706-001',
      suggested_sku: 'CPU-20260706-001',
    }]);

    expect(report.ok).toBe(true);
    expect(report.items[0]).toMatchObject({ aliasAlreadyActive: true });
  });
});
