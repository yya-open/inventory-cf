import { describe, expect, it } from 'vitest';
import {
  buildItemsListQuery,
  buildStockListQuery,
  buildTxExportSql,
  buildTxListQuery,
  buildWarningsQuery,
  parseItemInput,
} from '../functions/api/services/inventory';

describe('inventory services', () => {
  it('parses item input and trims fields', () => {
    const result = parseItemInput({ sku: '  SKU-1 ', name: ' 鼠标 ', unit: ' 盒 ', warning_qty: '5' });
    expect(result).toMatchObject({ sku: 'SKU-1', name: '鼠标', unit: '盒', warning_qty: 5 });
  });

  it('builds items query with whitelisted sort', () => {
    const url = new URL('https://example.com/api/items?keyword=abc&sort_by=sku&sort_dir=asc&page=2&page_size=30');
    const query = buildItemsListQuery(url);
    expect(query.orderBy).toContain('sku ASC');
    expect(query.page).toBe(2);
    expect(query.pageSize).toBe(30);
    expect(query.where).toContain('enabled=1');
  });

  it('builds stock query with keyword mode', () => {
    const url = new URL('https://example.com/api/stock?warehouse_id=2&keyword=dell%205480&sort=qty_desc');
    const query = buildStockListQuery(url);
    expect(query.warehouse_id).toBe(2);
    expect(query.orderBy).toContain('qty DESC');
    expect(query.keyword_mode).toBe('contains');
  });

  it('reuses tx filters for export SQL and supports keyword', () => {
    const url = new URL('https://example.com/api/tx?type=OUT&warehouse_id=3&keyword=alice&sort_by=created_at&sort_dir=asc');
    const query = buildTxListQuery(url);
    const sql = buildTxExportSql(query);
    expect(query.where).toContain('t.type=?');
    expect(query.where).toContain('t.warehouse_id=?');
    expect(query.keyword_mode).toBe('contains');
    expect(sql).toContain('t.id < ?');
    expect(sql).toContain('created_at_bj');
  });

  it('builds warnings query with category and only_alert flag', () => {
    const url = new URL('https://example.com/api/warnings?warehouse_id=5&category=配件&only_alert=0&keyword=hp');
    const query = buildWarningsQuery(url);
    expect(query.warehouse_id).toBe(5);
    expect(query.category).toBe('配件');
    expect(query.only_alert).toBe(false);
    expect(query.whereSql).toContain('i.category = ?');
  });
});
