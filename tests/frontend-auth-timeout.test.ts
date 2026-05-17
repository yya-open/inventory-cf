import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchMe, useAuth } from '../src/store/auth';

describe('frontend auth loading safeguards', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAuth().user = null;
    useAuth().loading = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('aborts a stalled auth probe so the first route cannot wait forever', async () => {
    const fetchMock = vi.fn((_path: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const pending = fetchMe({ force: true, timeoutMs: 50 });
    const assertion = expect(pending).rejects.toThrow('登录状态验证超时');

    await vi.advanceTimersByTimeAsync(50);

    await assertion;
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({
      method: 'GET',
      signal: expect.any(AbortSignal),
    }));
    expect(useAuth().loading).toBe(false);
  });
});
