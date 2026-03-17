import { describe, expect, it } from 'vitest';
import { hasRole, roleLevel } from '../src/utils/roles';

describe('role helpers', () => {
  it('orders roles correctly', () => { expect(roleLevel('viewer')).toBeLessThan(roleLevel('operator')); expect(roleLevel('operator')).toBeLessThan(roleLevel('admin')); });
  it('checks minimum permissions correctly', () => { expect(hasRole('admin', 'viewer')).toBe(true); expect(hasRole('operator', 'operator')).toBe(true); expect(hasRole('viewer', 'operator')).toBe(false); expect(hasRole(null, 'viewer')).toBe(false); });
});
