import { BACKUP_VERSION, EXPORTABLE_TABLE_NAMES, TABLE_COLUMNS, TABLE_BY_NAME, buildBackupMeta, groupLabel } from './_backup_schema';

const OPTIONAL_TABLE_GROUPS = {
  include_tx: ['stock_tx'],
  include_stocktake: ['stocktake', 'stocktake_line'],
  include_audit: ['audit_log'],
  include_throttle: ['auth_login_throttle', 'public_api_throttle'],
} as const;

const OPTIONAL_TABLE_SET = new Set<string>(Object.values(OPTIONAL_TABLE_GROUPS).flat());
const BASE_EXPORTABLE_TABLES = EXPORTABLE_TABLE_NAMES.filter((table) => !OPTIONAL_TABLE_SET.has(table));

type CursorKind = 'id' | 'k' | 'rowid';

type BackupTableStat = {
  group: string;
  group_label: string;
  label: string;
  rows: number;
};

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

export type BackupJsonStreamResult = {
  stream: ReadableStream<Uint8Array>;
  exportedAt: string;
  version: string;
  meta: Record<string, any>;
  stats: Record<string, BackupTableStat>;
  tables: string[];
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
      .filter((value): value is (typeof EXPORTABLE_TABLE_NAMES)[number] => EXPORTABLE_TABLE_NAMES.includes(value as any))
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

function resolveCursorKind(table: string): CursorKind {
  const cols = TABLE_COLUMNS[table] || [];
  if (cols.includes('id')) return 'id';
  if (cols.includes('k')) return 'k';
  return 'rowid';
}

function buildBackupMetaEnvelope(tables: string[], exportedAt: string, opts?: BackupBuildOptions) {
  return {
    version: BACKUP_VERSION,
    exported_at: exportedAt,
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
  };
}

export async function countTableRows(DB: D1Database, table: string, opts?: BackupBuildOptions) {
  const { whereSql, binds } = buildTableWhereSql(table, opts);
  const row = await DB.prepare(`SELECT COUNT(*) AS c FROM ${table}${whereSql}`).bind(...binds).first<any>();
  return Number(row?.c || 0);
}

export async function buildBackupStats(DB: D1Database, tables: string[], opts?: BackupBuildOptions) {
  const stats: Record<string, BackupTableStat> = {};
  for (const table of tables) {
    const rows = await countTableRows(DB, table, opts);
    const def = TABLE_BY_NAME[table];
    stats[table] = {
      group: def?.group || 'core',
      group_label: groupLabel(def?.group || 'core'),
      label: def?.label || table,
      rows,
    };
  }
  return stats;
}

export async function* iterateTableRows(DB: D1Database, table: string, opts?: BackupBuildOptions) {
  const cols = TABLE_COLUMNS[table] || ['*'];
  const pageSize = clampInt(opts?.pageSize, 1000, 100, 5000);
  const { whereSql, binds } = buildTableWhereSql(table, opts);
  const cursorKind = resolveCursorKind(table);
  let cursor: any = cursorKind === 'k' ? '' : 0;

  while (true) {
    const cursorWhere = cursorKind === 'id'
      ? 'id > ?'
      : cursorKind === 'k'
        ? 'k > ?'
        : 'rowid > ?';
    const combinedWhere = whereSql ? `${whereSql} AND ${cursorWhere}` : ` WHERE ${cursorWhere}`;
    const selectSql = cursorKind === 'rowid'
      ? `SELECT rowid AS __backup_rowid, ${cols.join(',')} FROM ${table}${combinedWhere} ORDER BY rowid ASC LIMIT ?`
      : `SELECT ${cols.join(',')} FROM ${table}${combinedWhere} ORDER BY ${cursorKind} ASC LIMIT ?`;
    const result = await DB.prepare(selectSql).bind(...binds, cursor, pageSize).all<any>();
    const batch = Array.isArray(result?.results) ? result.results : [];
    if (!batch.length) break;

    for (const rawRow of batch) {
      if (cursorKind === 'rowid') {
        cursor = Number(rawRow?.__backup_rowid || 0);
        const { __backup_rowid, ...row } = rawRow || {};
        yield row;
      } else {
        cursor = rawRow?.[cursorKind];
        yield rawRow;
      }
    }

    if (batch.length < pageSize) break;
  }
}

export async function fetchTableRows(DB: D1Database, table: string, opts?: BackupBuildOptions) {
  const rows: any[] = [];
  for await (const row of iterateTableRows(DB, table, opts)) rows.push(row);
  return rows;
}

export async function createBackupJsonStream(DB: D1Database, opts?: BackupBuildOptions): Promise<BackupJsonStreamResult> {
  const tables = opts?.includeTables?.length ? opts.includeTables : EXPORTABLE_TABLE_NAMES;
  const exportedAt = new Date().toISOString();
  const stats = await buildBackupStats(DB, tables, opts);
  const envelope = buildBackupMetaEnvelope(tables, exportedAt, opts);
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const writeChunk = async (value: string) => {
    await writer.write(encoder.encode(value));
  };

  void (async () => {
    try {
      await writeChunk('{');
      await writeChunk(`"version":${JSON.stringify(envelope.version)},`);
      await writeChunk(`"exported_at":${JSON.stringify(envelope.exported_at)},`);
      await writeChunk(`"meta":${JSON.stringify(envelope.meta)},`);
      await writeChunk(`"stats":${JSON.stringify(stats)},`);
      await writeChunk('"tables":{');
      let firstTable = true;
      for (const table of tables) {
        if (!firstTable) await writeChunk(',');
        firstTable = false;
        await writeChunk(`${JSON.stringify(table)}:[`);
        let firstRow = true;
        for await (const row of iterateTableRows(DB, table, opts)) {
          if (!firstRow) await writeChunk(',');
          firstRow = false;
          await writeChunk(JSON.stringify(row));
        }
        await writeChunk(']');
      }
      await writeChunk('}}');
      await writer.close();
    } catch (error) {
      try {
        await writer.abort(error);
      } catch {}
    }
  })();

  return {
    stream: readable,
    exportedAt,
    version: BACKUP_VERSION,
    meta: envelope.meta,
    stats,
    tables,
  };
}

export async function buildBackupPayload(DB: D1Database, opts?: BackupBuildOptions) {
  const tables = opts?.includeTables?.length ? opts.includeTables : EXPORTABLE_TABLE_NAMES;
  const tablePayload: Record<string, any[]> = {};
  for (const table of tables) {
    tablePayload[table] = await fetchTableRows(DB, table, opts);
  }
  const exportedAt = new Date().toISOString();
  const stats = await buildBackupStats(DB, tables, opts);
  const envelope = buildBackupMetaEnvelope(tables, exportedAt, opts);
  return {
    version: envelope.version,
    exported_at: envelope.exported_at,
    meta: envelope.meta,
    stats,
    tables: tablePayload,
  };
}
