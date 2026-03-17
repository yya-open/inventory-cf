import { describe, expect, it } from 'vitest';
import { hashPassword } from '../functions/_password';
import { signJwt, JWT_TTL_SECONDS } from '../functions/_auth';
import { onRequestPost as stocktakeCreatePost } from '../functions/api/stocktake/create';
import { onRequestPost as stocktakeApplyPost } from '../functions/api/stocktake/apply';
import { onRequestPost as stocktakeRollbackPost } from '../functions/api/stocktake/rollback';
import { createFakeEnv } from './helpers/fakeD1';
import { bearerRequest, createWaitUntil } from './helpers/workflow';

async function jsonOf(res: Response) { return await res.json() as any; }

describe('e2e stocktake workflow', () => {
  it('creates, applies, and rolls back a stocktake with stock restoration', async () => {
    const { env, DB } = createFakeEnv();
    DB.state.users.push({ id: 1, username: 'admin', password_hash: await hashPassword('admin123'), role: 'admin', is_active: 1, must_change_password: 0, token_version: 0 });
    DB.state.items.push({ id: 1, sku: 'SKU-1', name: '内存', enabled: 1 }, { id: 2, sku: 'SKU-2', name: '硬盘', enabled: 1 });
    DB.seedStock(1, 1, 5);
    DB.seedStock(2, 1, 2);

    const token = await signJwt({ sub: 1, u: 'admin', r: 'admin', tv: 0 }, env.JWT_SECRET, JWT_TTL_SECONDS);
    const wait = createWaitUntil();

    const createRes = await stocktakeCreatePost({ env, request: bearerRequest('https://example.com/api/stocktake/create', token, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ warehouse_id: 1 }) }), waitUntil: wait.waitUntil } as any);
    const createBody = await jsonOf(createRes);
    expect(createRes.status).toBe(200);
    expect(createBody.ok).toBe(true);
    expect(DB.state.stocktakeLines).toHaveLength(2);

    const stocktakeId = Number(createBody.id);
    const line1 = DB.state.stocktakeLines.find((line) => line.stocktake_id === stocktakeId && line.item_id === 1)!;
    const line2 = DB.state.stocktakeLines.find((line) => line.stocktake_id === stocktakeId && line.item_id === 2)!;
    line1.counted_qty = 3; line1.diff_qty = -2;
    line2.counted_qty = 5; line2.diff_qty = 3;

    const applyRes = await stocktakeApplyPost({ env, request: bearerRequest('https://example.com/api/stocktake/apply', token, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: stocktakeId }) }), waitUntil: wait.waitUntil } as any);
    const applyBody = await jsonOf(applyRes);
    expect(applyRes.status).toBe(200);
    expect(applyBody).toMatchObject({ ok: true, adjusted: 2 });
    expect(DB.state.stocktakes.find((row) => row.id === stocktakeId)?.status).toBe('APPLIED');
    expect(DB.state.stock.get('1|1')?.qty).toBe(3);
    expect(DB.state.stock.get('2|1')?.qty).toBe(5);
    expect(DB.state.stockTx.filter((tx) => tx.type === 'ADJUST')).toHaveLength(2);

    const rollbackRes = await stocktakeRollbackPost({ env, request: bearerRequest('https://example.com/api/stocktake/rollback', token, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: stocktakeId }) }), waitUntil: wait.waitUntil } as any);
    const rollbackBody = await jsonOf(rollbackRes);
    expect(rollbackRes.status).toBe(200);
    expect(rollbackBody).toMatchObject({ ok: true, reversed: 2 });
    expect(DB.state.stocktakes.find((row) => row.id === stocktakeId)?.status).toBe('DRAFT');
    expect(DB.state.stock.get('1|1')?.qty).toBe(5);
    expect(DB.state.stock.get('2|1')?.qty).toBe(2);
    expect(DB.state.stockTx.filter((tx) => tx.type === 'REVERSAL')).toHaveLength(2);

    await wait.flush();
  });
});
