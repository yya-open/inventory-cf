import { BACKUP_VERSION, EXPORTABLE_TABLE_NAMES, TABLE_COLUMNS, TABLE_BY_NAME, buildBackupMeta, groupLabel } from './_backup_schema';

const OPTIONAL_TABLE_GROUPS = {
  include_tx: ['stock_tx'],
  include_stocktake: ['stocktake', 'stocktake_line'],
  include_audit: ['audit_log'],
  include_throttle: ['auth_login_throttle', 'public_api_throttle'],
} as const;

const OPTIONAL_TABLE_SET = new Set(Object.values(OPTIONAL_TABLE_GROUPS).flat());
const BASE_EXPORTABLE_TABLES = EXPORTABLE_TABLE_NAMES.filter((table) => !OPTIONAL_TABLE_SET.has(table));

export type BackupBuildOptions = {
  actor?: string | null;
  reason?: string | null;
  includeTables?: string[];
  pageSize?: number | null;
  txSince?: string | null;
  txUntil?: string | null;
  auditSince?: string | null;
  auditUntil?: string | null;
};

function clampInt(value: any, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeDate(value: any) {
  const s = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function boolLike(value: any) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function getInputValue(input: any, key: string) {
  if (!input) return null;
  if (input instanceof URLSearchParams) return input.get(key);
  const value = input[key];
  return value == null ? null : value;
}

function normalizeTableList(values: any[]) {
  return Array.from(new Set(
    values
      .map((value) => String(value || '').trim())
      .filter((value) => EXPORTABLE_TABLE_NAMES.includes(value))
  ));
}

export function resolveBackupIncludeTables(input: any) {
  const explicitTable = String(getInputValue(input, 'table') || '').trim();
  if (explicitTable) return normalizeTableList([explicitTable]);

  const selectionMode = String(getInputValue(input, 'selection_mode') || '').trim().toLowerCase();
  const hasUiSelection = selectionMode === 'ui'
    || ['include_tx', 'include_stocktake', 'include_audit', 'include_throttle'].some((key) => getInputValue(input, key) != null);

  if (!hasUiSelection) return [...EXPORTABLE_TABLE_NAMES];

  const selected = new Set<string>(BASE_EXPORTABLE_TABLES);
  (Object.keys(OPTIONAL_TABLE_GROUPS) as Array<keyof typeof OPTIONAL_TABLE_GROUPS>).forEach((key) => {
    if (!boolLike(getInputValue(input, key))) return;
    OPTIONAL_TABLE_GROUPS[key].forEach((table) => selected.add(table));
  });
  return EXPORTABLE_TABLE_NAMES.filter((table) => selected.has(table));
}

export function parseBackupOptions(input: any, extra?: Partial<BackupBuildOptions>) {
  return {
    actor: extra?.actor ?? null,
    reason: extra?.reason ?? null,
    includeTables: extra?.includeTables?.length ? normalizeTableList(extra.includeTables) : resolveBackupIncludeTables(input),
    pageSize: extra?.pageSize ?? clampInt(getInputValue(input, 'page_size'), 1000, 100, 5000),
    txSince: extra?.txSince ?? normalizeDate(getInputValue(input, 'tx_since')),
    txUntil: extra?.txUntil ?? normalizeDate(getInputValue(input, 'tx_until')),
    auditSince: extra?.auditSince ?? normalizeDate(getInputValue(input, 'audit_since')),
    auditUntil: extra?.auditUntil ?? normalizeDate(getInputValue(input, 'audit_until')),
  } satisfies BackupBuildOptions;
}

export function buildBackupFilename(options?: { table?: string | null; gzip?: boolean | null; now?: Date | null }) {
  const d = options?.now || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const table = String(options?.table || '').trim();
  const prefix = table ? `inventory_${table}` : 'inventory_backup';
  return `${prefix}_${y}${m}${day}.json${options?.gzip ? '.gz' : ''}`;
}

export function pick(obj: any, cols: string[]) {
  return cols.map((c) => (obj?.[c] === undefined ? null : obj[c]));
}

function buildTableWhereSql(table: string, opts?: BackupBuildOptions) {
  const where: string[] = [];
  const binds: any[] = [];
  if (table === 'stock_tx') {
    if (opts?.txSince) {
      where.push(`created_at >= ?`);
      binds.push(`${opts.txSince} 00:00:00`);
    }
    if (opts?.txUntil) {
      where.push(`created_at <= ?`);
      binds.push(`${opts.txUntil} 23:59:59`);
    }
  }
  if (table === 'audit_log') {
    if (opts?.auditSince) {
      where.push(`created_at >= ?`);
      binds.push(`${opts.auditSince} 00:00:00`);
    }
    if (opts?.auditUntil) {
      where.push(`created_at <= ?`);
      binds.push(`${opts.auditUntil} 23:59:59`);
    }
  }
  return { whereSql: where.length ? ` WHERE ${where.join(' AND ')}` : '', binds };
}

function buildTableOrderSql(table: string) {
  const cols = TABLE_COLUMNS[table] || [];
  if (cols.includes('id')) return ' ORDER BY id ASC';
  if (cols.includes('k')) return ' ORDER BY k ASC';
  return ' ORDER BY rowid ASC';
}

export async function fetchTableRows(DB: D1Database, table: string, opts?: BackupBuildOptions) {
  const cols = TABLE_COLUMNS[table] || ['*'];
  const pageSize = clampInt(opts?.pageSize, 1000, 100, 5000);
  const { whereSql, binds } = buildTableWhereSql(table, opts);
  const orderSql = buildTableOrderSql(table);
  const rows: any[] = [];
  let offset = 0;
  while (true) {
    const sql = `SELECT ${cols.join(',')} FROM ${table}${whereSql}${orderSql} LIMIT ? OFFSET ?`;
    const r = await DB.prepare(sql).bind(...binds, pageSize, offset).all<any>();
    const batch = Array.isArray(r?.results) ? r.results : [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += batch.length;
  }
  return rows;
}

export async function buildBackupPayload(DB: D1Database, opts?: BackupBuildOptions) {
  const tables = opts?.includeTables?.length ? opts.includeTables : EXPORTABLE_TABLE_NAMES;
  const tablePayload: Record<string, any[]> = {};
  const stats: Record<string, any> = {};
  for (const table of tables) {
    const rows = await fetchTableRows(DB, table, opts);
    tablePayload[table] = rows;
    const def = TABLE_BY_NAME[table];
    stats[table] = {
      group: def?.group || 'core',
      group_label: groupLabel(def?.group || 'core'),
      label: def?.label || table,
      rows: rows.length,
    };
  }

  return {
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    meta: buildBackupMeta({
      actor: opts?.actor || null,
      reason: opts?.reason || null,
      table_count: tables.length,
      generated_by: 'manual',
      filters: {
        tx_since: opts?.txSince || null,
        tx_until: opts?.txUntil || null,
        audit_since: opts?.auditSince || null,
        audit_until: opts?.auditUntil || null,
        page_size: opts?.pageSize || null,
      },
    }),
    stats,
    tables: tablePayload,
  };
}
