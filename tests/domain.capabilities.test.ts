import { describe, expect, it } from 'vitest';
import { hasCapability, requireCapability } from '../src/domain/capabilities';

describe('capability rules', () => {
  const admin = { role: 'admin', permissions: { ops_tools: true, qr_export: true } };
  const viewer = { role: 'viewer', permissions: {} };

  it('grants based on role and permission', () => {
    expect(hasCapability(admin, 'system.tools.manage')).toBe(true);
    expect(hasCapability(admin, 'inventory.manage')).toBe(true);
    expect(hasCapability(viewer, 'inventory.view')).toBe(true);
    expect(hasCapability(viewer, 'system.tools.manage')).toBe(false);
  });

  it('throws when capability is missing', () => {
    expect(() => requireCapability(viewer, 'qr.export', 'denied')).toThrow('denied');
  });
});
