import { describe, expect, it } from 'vitest';
import { canAccessSystemArea, firstAccessibleRoute, firstAccessibleSystemRoute, getAccessibleRouteLabels } from '../src/utils/moduleAccess';

describe('system module access helpers', () => {
  it('falls back to the stock page when the warehouse scope is normalized to all', () => {
    const user = {
      role: 'viewer',
      permissions: { audit_export: true },
      data_scope_type: 'warehouse',
      data_scope_value: '[]',
      data_scope_value2: null,
    };
    expect(canAccessSystemArea(user)).toBe(true);
    expect(firstAccessibleSystemRoute(user)).toBe('/system/audit');
    expect(firstAccessibleRoute(user)).toBe('/stock');
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

  it.each([
    {
      name: 'operator with parts scope sees parts entry routes',
      user: {
        role: 'operator',
        permissions: {},
        data_scope_type: 'warehouse',
        data_scope_value: '配件仓',
        data_scope_value2: null,
      },
      expected: ['配件仓 / 库存查询', '配件仓 / 入库', '配件仓 / 批量操作'],
      unexpected: ['电脑仓 / 台账', '系统 / 用户管理'],
    },
    {
      name: 'viewer with pc and monitor scope sees both ledgers',
      user: {
        role: 'viewer',
        permissions: { audit_export: true },
        data_scope_type: 'warehouse',
        data_scope_value: JSON.stringify(['电脑仓', '显示器仓']),
        data_scope_value2: null,
      },
      expected: ['电脑仓 / 台账', '显示器仓 / 台账', '系统 / 审计日志'],
      unexpected: ['配件仓 / 库存查询', '系统 / 用户管理'],
    },
  ])('$name', ({ user, expected, unexpected }) => {
    const labels = getAccessibleRouteLabels(user as any);
    for (const label of expected) {
      expect(labels).toContain(label);
    }
    for (const label of unexpected) {
      expect(labels).not.toContain(label);
    }
  });
});
