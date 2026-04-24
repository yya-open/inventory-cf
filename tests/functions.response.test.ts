import { describe, expect, it } from 'vitest';
import { apiFail, apiOk } from '../functions/api/_response';

describe('api response envelopes', () => {
  it('returns success envelope', async () => {
    const response = apiOk({ id: 1 }, { message: 'done', meta: { source: 'test' } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, data: { id: 1 }, message: 'done', meta: { source: 'test' } });
  });

  it('returns failure envelope', async () => {
    const response = apiFail('bad request', { status: 422, meta: { code: 'INVALID' } });
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ ok: false, data: null, message: 'bad request', error_code: undefined, meta: { code: 'INVALID' } });
  });

  it('returns failure envelope with error code', async () => {
    const response = apiFail('forbidden', { status: 403, errorCode: 'SCOPE_WAREHOUSE_DENIED' });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, data: null, message: 'forbidden', error_code: 'SCOPE_WAREHOUSE_DENIED', meta: undefined });
  });
});
