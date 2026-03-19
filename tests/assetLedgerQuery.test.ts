import { describe, expect, it } from 'vitest';
import { buildMonitorAssetQuery, buildPcAssetQuery } from '../functions/api/services/asset-ledger';

function makeUrl(path: string) {
  return new URL(`https://example.com${path}`);
}

describe('asset ledger archive reason filters', () => {
  it('uses exact match for pc archive reason by default', () => {
    const query = buildPcAssetQuery(makeUrl('/api/pc-assets?archive_mode=archived&archive_reason=%E5%81%9C%E7%94%A8%E5%BD%92%E6%A1%A3'));
    expect(query.where).toContain("TRIM(COALESCE(a.archived_reason, ''))=?");
    expect(query.binds).toContain('停用归档');
  });

  it('supports explicit contains mode for pc archive reason', () => {
    const query = buildPcAssetQuery(makeUrl('/api/pc-assets?archive_mode=archived&archive_reason=%E5%81%9C%E7%94%A8&archive_reason_mode=contains'));
    expect(query.where).toContain("LIKE ? ESCAPE '\\'");
    expect(query.binds).toContain('%停用%');
  });

  it('uses exact match for monitor archive reason by default', () => {
    const query = buildMonitorAssetQuery(makeUrl('/api/monitor-assets?archive_mode=archived&archive_reason=%E9%97%B2%E7%BD%AE%E5%BD%92%E6%A1%A3'));
    expect(query.where).toContain("TRIM(COALESCE(a.archived_reason, ''))=?");
    expect(query.binds).toContain('闲置归档');
  });
});
