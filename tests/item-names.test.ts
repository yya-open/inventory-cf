import { describe, expect, it } from 'vitest';
import { resolveItemsByName } from '../functions/api/services/item-names';

class FakeDB {
  constructor(private items: Array<{ id: number; sku: string; name: string; enabled?: number }>) {}

  prepare() {
    return {
      bind: (...names: string[]) => ({
        all: async () => ({
          results: this.items
            .filter((item) => item.enabled !== 0 && names.includes(item.name))
            .map((item) => ({ id: item.id, sku: item.sku, name: item.name })),
        }),
      }),
    };
  }
}

describe('item name resolver', () => {
  it('finds enabled items by exact name and retains duplicate matches', async () => {
    const db = new FakeDB([
      { id: 1, sku: 'CPU-1', name: 'CPU i5' },
      { id: 2, sku: 'CPU-2', name: 'CPU i5' },
      { id: 3, sku: 'SSD-1', name: 'SSD 1TB', enabled: 0 },
    ]);

    const result = await resolveItemsByName(db as any, ['CPU i5', 'SSD 1TB', 'missing']);

    expect(result.get('CPU i5')).toHaveLength(2);
    expect(result.has('SSD 1TB')).toBe(false);
    expect(result.has('missing')).toBe(false);
  });
});
