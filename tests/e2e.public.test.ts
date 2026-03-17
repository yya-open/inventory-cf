import { describe, expect, it } from 'vitest';
import { signJwt, JWT_TTL_SECONDS } from '../functions/_auth';
import { onRequestGet as publicPcGet } from '../functions/api/public/pc-asset';
import { onRequestPost as publicPcInventoryPost } from '../functions/api/public/pc-asset-inventory';
import { createFakeEnv } from './helpers/fakeD1';

async function jsonOf(res: Response) { return await res.json() as any; }

describe('e2e public asset workflow', () => {
  it('supports token-based read and public inventory submission', async () => {
    const { env, DB } = createFakeEnv();
    DB.state.pcAssets.push({ id: 10, qr_key: 'pc-key-10', brand: 'Dell', model: 'OptiPlex 7000', serial_no: 'SN-10', manufacture_date: '2024-01-01', warranty_end: '2027-01-01', disk_capacity: '1TB', memory_size: '16GB', status: 'IN_STOCK', remark: 'test asset' });
    const token = await signJwt({ scope: 'pc_view', pc_asset_id: 10 }, env.JWT_SECRET, JWT_TTL_SECONDS);

    const readRes = await publicPcGet({ env, request: new Request(`https://example.com/public/pc-asset?token=${encodeURIComponent(token)}`, { headers: { 'CF-Connecting-IP': '2.2.2.2' } }) } as any);
    const readBody = await jsonOf(readRes);
    expect(readRes.status).toBe(200);
    expect(readBody.data.id).toBe(10);
    expect(readBody.data.brand).toBe('Dell');

    const submitRes = await publicPcInventoryPost({ env, request: new Request(`https://example.com/public/pc-asset-inventory?token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '2.2.2.2', 'User-Agent': 'vitest' }, body: JSON.stringify({ action: 'issue', issue_type: 'wrong_qr', remark: '  mismatch  ' }) }) } as any);
    const submitBody = await jsonOf(submitRes);
    expect(submitRes.status).toBe(200);
    expect(submitBody.ok).toBe(true);
    expect(DB.state.pcInventoryLog).toHaveLength(1);
    expect(DB.state.pcInventoryLog[0]).toMatchObject({ asset_id: 10, action: 'ISSUE', issue_type: 'WRONG_QR', remark: 'mismatch' });
  });

  it('rate limits repeated public inventory submissions per minute', async () => {
    const { env, DB } = createFakeEnv();
    DB.state.pcAssets.push({ id: 20, qr_key: 'pc-key-20', brand: 'HP', model: '800 G9', serial_no: 'SN-20', status: 'IN_STOCK' });
    const token = await signJwt({ scope: 'pc_view', pc_asset_id: 20 }, env.JWT_SECRET, JWT_TTL_SECONDS);
    let lastStatus = 0;
    for (let i = 0; i < 9; i += 1) {
      const res = await publicPcInventoryPost({ env, request: new Request(`https://example.com/public/pc-asset-inventory?token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '3.3.3.3' }, body: JSON.stringify({ action: 'ok' }) }) } as any);
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
