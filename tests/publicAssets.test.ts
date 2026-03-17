import { describe, expect, it } from 'vitest';
import { buildAssetQrUrl } from '../functions/api/services/asset-qr';
import { parsePublicInventoryBody, publicAssetSubject } from '../functions/api/services/public-assets';

describe('public asset helpers', () => {
  it('builds public asset qr url safely', () => {
    const url = buildAssetQrUrl('https://example.com', '/public/pc-asset', 12, 'abc+/=');
    expect(url).toBe('https://example.com/public/pc-asset?id=12&key=abc%2B%2F%3D');
  });

  it('parses issue payload with normalization', () => {
    const payload = parsePublicInventoryBody({ action: 'issue', issue_type: 'wrong_qr', remark: '  test  ' });
    expect(payload).toEqual({
      action: 'ISSUE',
      issueType: 'WRONG_QR',
      remark: 'test',
    });
  });

  it('drops issue type for ok action', () => {
    const payload = parsePublicInventoryBody({ action: 'ok', issue_type: 'missing' });
    expect(payload.issueType).toBeNull();
  });

  it('builds stable public asset subject from token or id', () => {
    const tokenSubject = publicAssetSubject(new URL('https://example.com/public?token=abcdefghijklmnop'));
    const idSubject = publicAssetSubject(new URL('https://example.com/public?id=55'));
    expect(tokenSubject).toBe('abcdefghijkl');
    expect(idSubject).toBe('55');
  });
});
