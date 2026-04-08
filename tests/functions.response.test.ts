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
    await expect(response.json()).resolves.toEqual({ ok: false, data: null, message: 'bad request', meta: { code: 'INVALID' } });
  });
});
