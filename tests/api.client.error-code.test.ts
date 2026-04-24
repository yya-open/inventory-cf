import { describe, expect, it } from 'vitest';
import { apiGetData, isApiErrorCode } from '../src/api/client';

describe('api client error code mapping', () => {
  it('maps known scope error codes to stable frontend messages', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        return new Response(JSON.stringify({ ok: false, message: 'raw backend message', error_code: 'SCOPE_WAREHOUSE_DENIED' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        });
      };

      await expect(apiGetData('/api/mock')).rejects.toMatchObject({
        status: 403,
        error_code: 'SCOPE_WAREHOUSE_DENIED',
        message: '当前账号的数据范围不包含该仓库，请联系管理员调整权限范围。',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('provides stable error code guard helper', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        return new Response(JSON.stringify({ ok: false, message: 'conflict', error_code: 'WRITE_CONFLICT' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        });
      };

      try {
        await apiGetData('/api/mock-write');
      } catch (e) {
        expect(isApiErrorCode(e, 'WRITE_CONFLICT')).toBe(true);
        expect(isApiErrorCode(e, 'INVALID_PARAMS')).toBe(false);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
