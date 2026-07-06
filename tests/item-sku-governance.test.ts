import { describe, expect, it } from 'vitest';
import { analyzeItemSku, scanItemSkuGovernance, validateGovernanceSku } from '../functions/api/services/item-sku-governance';

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
});
