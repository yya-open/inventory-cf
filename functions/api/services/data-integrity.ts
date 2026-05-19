import { countTableRows } from '../admin/_backup_helpers';
import type { BackupManifest } from '../admin/_backup_integrity';
import { getRequiredWarehouses, isPermissionWarehouseScopeValue, normalizeUserDataScope } from './data-scope';

export type DataIntegrityIssue = {
  key: string;
  severity: 'error' | 'warn';
  table?: string;
  count: number;
  message: string;
  sample: any[];
};

export type DataIntegritySummary = {
  ok: boolean;
  checked_at: string;
  issue_count: number;
  issues: DataIntegrityIssue[];
  checks: {
    foreign_key_ok: boolean;
    quick_check_ok: boolean;
  };
};

async function runQuickDatabaseChecks(db: D1Database, sampleLimit: number) {
  const issues: DataIntegrityIssue[] = [];

  let foreignKeyOk = true;
  try {
    const rows = await queryRows(db, 'PRAGMA foreign_key_check');
    if (rows.length) {
      foreignKeyOk = false;
      issues.push({
        key: 'foreign_key_check',
        severity: 'error',
        table: String(rows[0]?.table || ''),
        count: rows.length,
        message: 'foreign_key_check returned errors; foreign key inconsistency exists',
        sample: rows.slice(0, sampleLimit),
      });
    }
  } catch {
    foreignKeyOk = false;
    issues.push({ key: 'foreign_key_check_failed', severity: 'warn', count: 1, message: 'Unable to run foreign_key_check', sample: [] });
  }

  let quickCheckOk = true;
  try {
    const rows = await queryRows(db, 'PRAGMA quick_check');
    const first = String(rows[0]?.quick_check || rows[0]?.integrity_check || rows[0]?.result || '').trim().toLowerCase();
    if (rows.length && first && first !== 'ok') {
      quickCheckOk = false;
      issues.push({ key: 'quick_check', severity: 'error', count: rows.length, message: 'quick_check returned non-ok', sample: rows.slice(0, sampleLimit) });
    }
  } catch {
    quickCheckOk = false;
    issues.push({ key: 'quick_check_failed', severity: 'warn', count: 1, message: 'Unable to run quick_check', sample: [] });
  }

  return {
    ok: issues.every((issue) => issue.severity !== 'error'),
    checked_at: new Date().toISOString(),
    issue_count: issues.length,
    issues,
    checks: {
      foreign_key_ok: foreignKeyOk,
      quick_check_ok: quickCheckOk,
    },
  } satisfies DataIntegritySummary;
}

async function queryRows(db: D1Database, sql: string, binds: any[] = []) {
  try {
    const result = await db.prepare(sql).bind(...binds).all<any>();
    return Array.isArray(result?.results) ? result.results : [];
  } catch {
    return [];
  }
}

async function makeIssue(db: D1Database, issue: Omit<DataIntegrityIssue, 'count' | 'sample'> & { sql: string; binds?: any[]; sampleLimit?: number }) {
  const rows = await queryRows(db, `${issue.sql} LIMIT ?`, [...(issue.binds || []), Math.max(1, Math.min(20, Number(issue.sampleLimit || 5)))]);
  return {
    key: issue.key,
    severity: issue.severity,
    table: issue.table,
    count: rows.length,
    message: issue.message,
    sample: rows,
  } satisfies DataIntegrityIssue;
}

function normalizeNullableText(value: any) {
  const raw = String(value ?? '').trim();
  return raw || null;
}

function isCanonicalUserScope(row: any) {
  const normalized = normalizeUserDataScope(row?.data_scope_type, row?.data_scope_value, row?.data_scope_value2);
  return String(row?.data_scope_type || 'all').trim().toLowerCase() === normalized.data_scope_type
    && normalizeNullableText(row?.data_scope_value) === normalizeNullableText(normalized.data_scope_value)
    && normalizeNullableText(row?.data_scope_value2) === normalizeNullableText(normalized.data_scope_value2);
}

async function collectUserScopeFormatIssues(db: D1Database, sampleLimit: number) {
  const rows = await queryRows(db, `SELECT id, username, data_scope_type, data_scope_value, data_scope_value2 FROM users`);
  const invalid: any[] = [];
  const legacy: any[] = [];
  for (const row of rows) {
    const normalized = normalizeUserDataScope(row?.data_scope_type, row?.data_scope_value, row?.data_scope_value2);
    const warehouses = getRequiredWarehouses(normalized) || [];
    const invalidWarehouse = warehouses.find((item) => !isPermissionWarehouseScopeValue(item));
    if (invalidWarehouse) {
      invalid.push({ ...row, invalid_warehouse: invalidWarehouse });
      continue;
    }
    if (!isCanonicalUserScope(row)) {
      legacy.push({ ...row, normalized });
    }
  }
  const issues: DataIntegrityIssue[] = [];
  if (invalid.length) {
    issues.push({
      key: 'invalid_user_scope_warehouse',
      severity: 'error',
      table: 'users',
      count: invalid.length,
      message: '存在未纳入权限仓域清单的数据范围值',
      sample: invalid.slice(0, sampleLimit),
    });
  }
  if (legacy.length) {
    issues.push({
      key: 'legacy_user_scope_format',
      severity: 'warn',
      table: 'users',
      count: legacy.length,
      message: '存在旧版用户数据范围格式，建议迁移为 JSON 多选仓域格式',
      sample: legacy.slice(0, sampleLimit),
    });
  }
  return issues;
}

function validDataScopePredicate(prefix = 'users') {
  const p = prefix ? `${prefix}.` : '';
  return `(
    LOWER(TRIM(COALESCE(${p}data_scope_type, 'all'))) = 'all'
      AND TRIM(COALESCE(${p}data_scope_value, '')) = ''
      AND TRIM(COALESCE(${p}data_scope_value2, '')) = ''
  ) OR (
    LOWER(TRIM(COALESCE(${p}data_scope_type, 'all'))) = 'department'
      AND TRIM(COALESCE(${p}data_scope_value, '')) <> ''
      AND TRIM(COALESCE(${p}data_scope_value2, '')) = ''
  ) OR (
    LOWER(TRIM(COALESCE(${p}data_scope_type, 'all'))) = 'warehouse'
      AND TRIM(COALESCE(${p}data_scope_value, '')) <> ''
      AND TRIM(COALESCE(${p}data_scope_value2, '')) = ''
  ) OR (
    LOWER(TRIM(COALESCE(${p}data_scope_type, 'all'))) = 'department_warehouse'
      AND TRIM(COALESCE(${p}data_scope_value, '')) <> ''
      AND TRIM(COALESCE(${p}data_scope_value2, '')) <> ''
  )`;
}

export async function runDataIntegrityChecks(db: D1Database, options?: { sampleLimit?: number }) {
  const sampleLimit = Math.max(1, Math.min(20, Number(options?.sampleLimit || 5)));
  const issues: DataIntegrityIssue[] = [];

  const definitions = [
    {
      key: 'blank_username',
      severity: 'error' as const,
      table: 'users',
      message: '存在空用户名，违反用户主数据约束',
      sql: `SELECT id, username FROM users WHERE TRIM(COALESCE(username, '')) = ''`,
    },
    {
      key: 'invalid_user_scope',
      severity: 'error' as const,
      table: 'users',
      message: '存在非法的数据范围组合',
      sql: `SELECT id, username, data_scope_type, data_scope_value, data_scope_value2 FROM users WHERE NOT (${validDataScopePredicate('users')})`,
    },
    {
      key: 'negative_stock_qty',
      severity: 'error' as const,
      table: 'stock',
      message: '存在负库存数量',
      sql: `SELECT id, item_id, warehouse_id, qty FROM stock WHERE COALESCE(qty, 0) < 0`,
    },
    {
      key: 'blank_pc_serial',
      severity: 'error' as const,
      table: 'pc_assets',
      message: '存在空电脑序列号',
      sql: `SELECT id, serial_no, brand, model FROM pc_assets WHERE TRIM(COALESCE(serial_no, '')) = ''`,
    },
    {
      key: 'blank_monitor_asset_code',
      severity: 'error' as const,
      table: 'monitor_assets',
      message: '存在空显示器资产编码',
      sql: `SELECT id, asset_code, sn, brand, model FROM monitor_assets WHERE TRIM(COALESCE(asset_code, '')) = ''`,
    },
    {
      key: 'orphan_pc_latest_state',
      severity: 'warn' as const,
      table: 'pc_asset_latest_state',
      message: '存在游离的电脑最新状态快照',
      sql: `SELECT s.asset_id FROM pc_asset_latest_state s LEFT JOIN pc_assets a ON a.id = s.asset_id WHERE a.id IS NULL`,
    },
    {
      key: 'orphan_monitor_tx_asset',
      severity: 'warn' as const,
      table: 'monitor_tx',
      message: '存在引用不存在资产的显示器流水',
      sql: `SELECT t.id, t.asset_id, t.tx_no FROM monitor_tx t LEFT JOIN monitor_assets a ON a.id = t.asset_id WHERE a.id IS NULL`,
    },
  ];

  for (const definition of definitions) {
    const issue = await makeIssue(db, { ...definition, sampleLimit });
    if (issue.count > 0) issues.push(issue);
  }

  issues.push(...await collectUserScopeFormatIssues(db, sampleLimit));

  let foreignKeyOk = true;
  try {
    const rows = await queryRows(db, 'PRAGMA foreign_key_check');
    if (rows.length) {
      foreignKeyOk = false;
      issues.push({
        key: 'foreign_key_check',
        severity: 'error',
        table: String(rows[0]?.table || ''),
        count: rows.length,
        message: 'foreign_key_check 返回异常，存在外键一致性问题',
        sample: rows.slice(0, sampleLimit),
      });
    }
  } catch {
    foreignKeyOk = false;
    issues.push({ key: 'foreign_key_check_failed', severity: 'warn', count: 1, message: '无法执行 foreign_key_check', sample: [] });
  }

  let quickCheckOk = true;
  try {
    const rows = await queryRows(db, 'PRAGMA quick_check');
    const first = String(rows[0]?.quick_check || rows[0]?.integrity_check || rows[0]?.result || '').trim().toLowerCase();
    if (rows.length && first && first !== 'ok') {
      quickCheckOk = false;
      issues.push({ key: 'quick_check', severity: 'error', count: rows.length, message: 'quick_check 未返回 ok', sample: rows.slice(0, sampleLimit) });
    }
  } catch {
    quickCheckOk = false;
    issues.push({ key: 'quick_check_failed', severity: 'warn', count: 1, message: '无法执行 quick_check', sample: [] });
  }

  return {
    ok: issues.every((issue) => issue.severity !== 'error'),
    checked_at: new Date().toISOString(),
    issue_count: issues.length,
    issues,
    checks: {
      foreign_key_ok: foreignKeyOk,
      quick_check_ok: quickCheckOk,
    },
  } satisfies DataIntegritySummary;
}

export async function buildRestoreVerification(db: D1Database, input: {
  mode: 'merge' | 'merge_upsert' | 'replace';
  manifest?: BackupManifest | null;
  tableOrder: string[];
  processedRows: number;
  totalRows: number;
}, options?: { integrityMode?: 'full' | 'quick' }) {
  const rowChecks: Array<{ table: string; expected_rows: number | null; actual_rows: number | null; policy: 'exact' | 'processed_only'; ok: boolean; }> = [];

  if (input.mode === 'replace' && input.manifest) {
    for (const table of input.tableOrder) {
      const expectedRows = Number(input.manifest.tables?.[table]?.rows || 0);
      const actualRows = await countTableRows(db, table).catch(() => null);
      rowChecks.push({
        table,
        expected_rows: expectedRows,
        actual_rows: actualRows == null ? null : Number(actualRows || 0),
        policy: 'exact',
        ok: actualRows != null && Number(actualRows || 0) === expectedRows,
      });
    }
  } else {
    rowChecks.push({
      table: '__restore__',
      expected_rows: Number(input.totalRows || 0),
      actual_rows: Number(input.processedRows || 0),
      policy: 'processed_only',
      ok: Number(input.processedRows || 0) === Number(input.totalRows || 0),
    });
  }

  const integrity = options?.integrityMode === 'quick'
    ? await runQuickDatabaseChecks(db, 5)
    : await runDataIntegrityChecks(db, { sampleLimit: 5 });
  const rowChecksOk = rowChecks.every((item) => item.ok);
  return {
    ok: rowChecksOk && integrity.ok,
    checked_at: new Date().toISOString(),
    mode: input.mode,
    processed_rows: Number(input.processedRows || 0),
    total_rows: Number(input.totalRows || 0),
    row_checks: rowChecks,
    integrity,
    integrity_mode: options?.integrityMode || 'full',
  };
}
