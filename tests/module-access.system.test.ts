import { describe, expect, it } from 'vitest';
import { canAccessSystemArea, firstAccessibleRoute, firstAccessibleSystemRoute } from '../src/utils/moduleAccess';

describe('system module access helpers', () => {
  it('routes audit users into the audit page when no warehouse scope exists', () => {
    const user = {
      role: 'viewer',
      permissions: { audit_export: true },
      data_scope_type: 'warehouse',
      data_scope_value: '[]',
      data_scope_value2: null,
    };
    expect(canAccessSystemArea(user)).toBe(true);
    expect(firstAccessibleSystemRoute(user)).toBe('/system/audit');
    expect(firstAccessibleRoute(user)).toBe('/system/audit');
  });

  it('prefers task center for job managers', () => {
    const user = {
      role: 'viewer',
      permissions: { async_job_manage: true },
      data_scope_type: 'warehouse',
      data_scope_value: '[]',
      data_scope_value2: null,
    };
    expect(firstAccessibleSystemRoute(user)).toBe('/system/tasks');
  });

  it('keeps admins on system home', () => {
    const user = {
      role: 'admin',
      permissions: {},
      data_scope_type: 'all',
      data_scope_value: null,
      data_scope_value2: null,
    };
    expect(firstAccessibleSystemRoute(user)).toBe('/system/home');
    expect(firstAccessibleRoute(user)).toBe('/stock');
  });
});
