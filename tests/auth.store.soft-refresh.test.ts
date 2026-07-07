import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshAuthInBackground, useAuth, type User } from '../src/store/auth';

const activeUser: User = {
  id: 7,
  username: 'soft-refresh-user',
  role: 'viewer',
  must_change_password: 0,
  permission_template_code: 'readonly',
  permissions: {},
  data_scope_type: 'all',
  data_scope_value: null,
  data_scope_value2: null,
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('auth store soft refresh', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuth().user = { ...activeUser };
  });

  afterEach(() => {
    useAuth().user = null;
    vi.restoreAllMocks();
  });

  it('keeps the active user when a background refresh fails with a server error', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(500, {
      ok: false,
      message: 'temporary failure',
    }) as any);

    await expect(refreshAuthInBackground({ force: true })).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ method: 'GET' }));
    expect(useAuth().user?.id).toBe(activeUser.id);
  });

  it('clears the active user and notifies the caller when a background refresh gets 401', async () => {
    const onUnauthorized = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(401, {
      ok: false,
      message: 'expired',
    }) as any);

    await expect(refreshAuthInBackground({ force: true, onUnauthorized })).resolves.toBeNull();

    expect(useAuth().user).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
