import { describe, expect, it } from 'vitest';

import {
  ALL_PERMISSION_CODES,
  PERMISSION_TEMPLATES,
  defaultTemplateForRole,
  getPermissionTemplateMap,
  getUserPermissionMap,
  normalizePermissionTemplateCode,
} from '../functions/_permissions';

/**
 * Regression cover for the permission-template privilege escalation (CWE-269).
 *
 * normalizePermissionTemplateCode used to accept any KNOWN template code without
 * checking it against the account's role, and getUserPermissionMap short-circuited
 * on `admin_full` for every role. An operator or viewer carrying
 * permission_template_code='admin_full' therefore resolved to an all-true
 * permission map, losing the role floor entirely.
 *
 * These tests import the REAL module — tests/auth.regressions.test.ts mocks
 * ../functions/_permissions wholesale, so nothing there exercises this logic.
 */

/** user_permissions read must never be reached for a short-circuiting admin. */
function dbReturning(rows: { permission_code: string; allowed: number }[]) {
  let reads = 0;
  const db = {
    prepare(sql: string) {
      return {
        bind: () => ({
          all: async () => {
            if (/FROM user_permissions/i.test(sql)) reads += 1;
            return { results: rows };
          },
          run: async () => ({}),
        }),
        run: async () => ({}),
      };
    },
  };
  return { db: db as unknown as D1Database, reads: () => reads };
}

describe('permission template role floor', () => {
  it('keeps a template whose role_hint matches the account role', () => {
    expect(normalizePermissionTemplateCode('admin', 'admin_full')).toBe('admin_full');
    expect(normalizePermissionTemplateCode('operator', 'operator_plus')).toBe('operator_plus');
    expect(normalizePermissionTemplateCode('viewer', 'readonly')).toBe('readonly');
  });

  it('downgrades a template that outranks the account role', () => {
    // admin_full / admin_ops are role_hint 'admin' (level 3).
    expect(normalizePermissionTemplateCode('operator', 'admin_full')).toBe('operator_plus');
    expect(normalizePermissionTemplateCode('operator', 'admin_ops')).toBe('operator_plus');
    expect(normalizePermissionTemplateCode('viewer', 'admin_full')).toBe('readonly');
    expect(normalizePermissionTemplateCode('viewer', 'operator_plus')).toBe('readonly');
  });

  it('allows a template ranked at or below the account role', () => {
    // auditor is role_hint 'viewer', so operator and admin may both hold it.
    expect(normalizePermissionTemplateCode('operator', 'auditor')).toBe('auditor');
    expect(normalizePermissionTemplateCode('admin', 'auditor')).toBe('auditor');
    expect(normalizePermissionTemplateCode('admin', 'operator_plus')).toBe('operator_plus');
  });

  it('falls back to the role default for unknown or empty codes', () => {
    for (const role of ['admin', 'operator', 'viewer']) {
      expect(normalizePermissionTemplateCode(role, 'not_a_template')).toBe(defaultTemplateForRole(role));
      expect(normalizePermissionTemplateCode(role, '')).toBe(defaultTemplateForRole(role));
      expect(normalizePermissionTemplateCode(role, null)).toBe(defaultTemplateForRole(role));
    }
  });

  it('treats an unrecognized role as the lowest rank', () => {
    // Anything that is not admin/operator normalizes to viewer, so an unknown role
    // string must not smuggle an admin template through.
    expect(normalizePermissionTemplateCode('superuser', 'admin_full')).toBe('readonly');
    expect(normalizePermissionTemplateCode(null, 'admin_full')).toBe('readonly');
    expect(normalizePermissionTemplateCode(undefined, 'admin_full')).toBe('readonly');
  });

  it('reports the downgraded template through getPermissionTemplateMap', () => {
    const operator = getPermissionTemplateMap('operator', 'admin_full');
    expect(operator.code).toBe('operator_plus');
    expect(operator.permissions.system_settings_write).toBe(false);

    const admin = getPermissionTemplateMap('admin', 'admin_full');
    expect(admin.code).toBe('admin_full');
    expect(admin.permissions.system_settings_write).toBe(true);
  });

  it('denies an operator holding admin_full the full permission map', async () => {
    const { db } = dbReturning([]);
    const map = await getUserPermissionMap(db, 999, 'operator', 'admin_full');

    expect(Object.values(map).every((allowed) => allowed === true)).toBe(false);
    expect(map.system_settings_write).toBe(false);
    expect(map.asset_purge).toBe(false);
    // operator_plus still keeps its own grants.
    expect(map.bulk_operation).toBe(true);
  });

  it('denies a viewer holding admin_full every elevated permission', async () => {
    const { db } = dbReturning([]);
    const map = await getUserPermissionMap(db, 998, 'viewer', 'admin_full');

    for (const code of ALL_PERMISSION_CODES) expect(map[code]).toBe(false);
  });

  it('still grants a real admin everything without reading user_permissions', async () => {
    const { db, reads } = dbReturning([]);
    const map = await getUserPermissionMap(db, 1, 'admin', 'admin_full');

    for (const code of ALL_PERMISSION_CODES) expect(map[code]).toBe(true);
    // The admin_full short-circuit keeps /api/auth/me off the extra query.
    expect(reads()).toBe(0);
  });

  it('lets per-user overrides apply to a downgraded account', async () => {
    // Falling through to user_permissions is the whole point of dropping the
    // short-circuit for non-admins: an explicit grant must still be honoured.
    const { db, reads } = dbReturning([{ permission_code: 'audit_export', allowed: 1 }]);
    const map = await getUserPermissionMap(db, 997, 'operator', 'admin_full');

    expect(reads()).toBe(1);
    expect(map.audit_export).toBe(true);
    expect(map.system_settings_write).toBe(false);
  });

  it('honours an explicit deny override against the template default', async () => {
    const { db } = dbReturning([{ permission_code: 'bulk_operation', allowed: 0 }]);
    const map = await getUserPermissionMap(db, 996, 'operator', 'operator_plus');

    expect(PERMISSION_TEMPLATES.operator_plus.permissions.bulk_operation).toBe(true);
    expect(map.bulk_operation).toBe(false);
  });
});
