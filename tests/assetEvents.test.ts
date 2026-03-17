import { describe, expect, it } from 'vitest';
import {
  buildMonitorInventoryLogQuery,
  buildMonitorTxExportSql,
  buildMonitorTxQuery,
  buildPcInventoryLogExportSql,
  buildPcInventoryLogQuery,
  buildPcTxQuery,
} from '../functions/api/services/asset-events';
import { buildStocktakeListQuery, generateStocktakeNo } from '../functions/api/services/stocktake';

describe('asset event services', () => {
  it('supports pc scrap type consistently', () => {
    const query = buildPcTxQuery(new URL('https://example.com/api/pc-tx?type=SCRAP&keyword=abc'));
    expect(query.where).toContain('x.type=?');
    expect(query.binds[0]).toBe('SCRAP');
  });

  it('normalizes monitor tx date aliases to full-day ranges', () => {
    const query = buildMonitorTxQuery(new URL('https://example.com/api/monitor-tx?start=2026-03-01&end=2026-03-17'));
    expect(query.binds).toContain('2026-03-01 00:00:00');
    expect(query.binds).toContain('2026-03-17 23:59:59');
  });

  it('reuses monitor tx filters for export sql', () => {
    const query = buildMonitorTxQuery(new URL('https://example.com/api/monitor-tx?tx_type=TRANSFER&keyword=alice'));
    const sql = buildMonitorTxExportSql(query);
    expect(query.where).toContain('t.tx_type=?');
    expect(sql).toContain('t.id < ?');
    expect(sql).toContain('created_at_bj');
  });

  it('builds pc inventory log query and export from same filters', () => {
    const query = buildPcInventoryLogQuery(new URL('https://example.com/api/pc-inventory-log/list?action=ISSUE&issue_type=MISSING&keyword=hp'));
    const sql = buildPcInventoryLogExportSql(query);
    expect(query.where).toContain('l.action=?');
    expect(query.where).toContain('l.issue_type=?');
    expect(sql).toContain('l.id < ?');
  });

  it('builds monitor inventory log query', () => {
    const query = buildMonitorInventoryLogQuery(new URL('https://example.com/api/monitor-inventory-log/list?action=OK&date_to=2026-03-17'));
    expect(query.where).toContain('l.action=?');
    expect(query.binds).toContain('2026-03-17 23:59:59');
  });
});

describe('stocktake services', () => {
  it('builds stocktake list query with whitelist sort', () => {
    const query = buildStocktakeListQuery(new URL('https://example.com/api/stocktake/list?warehouse_id=2&status=DRAFT&sort_by=created_at&sort_dir=desc'));
    expect(query.where).toContain('s.warehouse_id=?');
    expect(query.where).toContain('s.status=?');
    expect(query.orderBy).toContain('s.created_at DESC');
  });

  it('generates beijing stocktake number format', () => {
    const no = generateStocktakeNo(new Date('2026-03-17T03:00:00Z'));
    expect(no).toMatch(/^ST20260317-\d{6}$/);
  });
});
