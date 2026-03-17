import { describe, expect, it } from 'vitest';
import { normalizeAuditAction } from '../functions/api/_audit';
import { SQL_STORED_NOW_DEFAULT } from '../functions/api/_time';

describe('audit action normalization', () => {
  it('normalizes lowercase and dotted action names', () => {
    expect(normalizeAuditAction('monitor_inventory_log_export')).toBe('MONITOR_INVENTORY_LOG_EXPORT');
    expect(normalizeAuditAction('admin.init_schema')).toBe('ADMIN_INIT_SCHEMA');
  });

  it('collapses separators and trims unknown input', () => {
    expect(normalizeAuditAction('  pc-location delete  ')).toBe('PC_LOCATION_DELETE');
    expect(normalizeAuditAction('___')).toBe('UNKNOWN');
  });
});

describe('stored timestamp ddl default', () => {
  it('keeps runtime schema default aligned with stored timezone strategy', () => {
    expect(SQL_STORED_NOW_DEFAULT).toBe("(datetime('now','+8 hours'))");
  });
});
