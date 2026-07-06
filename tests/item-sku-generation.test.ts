import { describe, expect, it } from 'vitest';
import {
  buildAutoItemSkuPrefix,
  generateItemSku,
  parseItemInput,
} from '../functions/api/services/inventory';

class FakeStatement {
  private params: any[] = [];

  constructor(private skus: string[]) {}

  bind(...params: any[]) {
    this.params = params;
    return this;
  }

  async all<T = any>() {
    const prefix = String(this.params[0] || '').replace(/%$/, '');
    return {
      results: this.skus
        .filter((sku) => sku.startsWith(prefix))
        .sort()
        .reverse()
        .map((sku) => ({ sku })) as T[],
    };
  }
}

class FakeDB {
  constructor(private skus: string[]) {}

  prepare() {
    return new FakeStatement(this.skus);
  }
}

describe('item SKU generation', () => {
  it('builds an auto SKU prefix from ascii words in the item name', () => {
    expect(buildAutoItemSkuPrefix({
      name: 'NVMe SSD 1TB',
      brand: 'Samsung',
      model: '980',
      category: '硬盘',
    })).toBe('NVME-SSD-1TB');
  });

  it('falls back to known parts category aliases for Chinese-only names', () => {
    expect(buildAutoItemSkuPrefix({
      name: '三星固态硬盘',
      brand: null,
      model: null,
      category: '硬盘',
    })).toBe('SSD');
  });

  it('increments the daily sequence when generated SKUs already exist', async () => {
    const db = new FakeDB([
      'NVME-SSD-1TB-20260706-001',
      'NVME-SSD-1TB-20260706-002',
    ]);

    await expect(generateItemSku(db as any, {
      name: 'NVMe SSD 1TB',
      brand: null,
      model: null,
      category: null,
    }, new Date('2026-07-06T00:00:00+08:00'))).resolves.toBe('NVME-SSD-1TB-20260706-003');
  });

  it('allows blank SKU only when auto SKU is explicitly enabled', () => {
    expect(() => parseItemInput({ sku: '', name: '测试物料' })).toThrow();
    expect(parseItemInput({ sku: '', name: '测试物料' }, { allowAutoSku: true }).sku).toBe('');
  });
});
