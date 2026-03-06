import { BACKUP_VERSION, EXPORTABLE_TABLE_NAMES, TABLE_COLUMNS, TABLE_BY_NAME, buildBackupMeta, groupLabel } from './_backup_schema';

export function pick(obj: any, cols: string[]) {
  return cols.map((c) => (obj?.[c] === undefined ? null : obj[c]));
}

export async function fetchTableRows(DB: D1Database, table: string) {
  const cols = TABLE_COLUMNS[table] || ['*'];
  const sql = `SELECT ${cols.join(',')} FROM ${table}`;
  const r = await DB.prepare(sql).all<any>();
  return Array.isArray(r?.results) ? r.results : [];
}

export async function buildBackupPayload(DB: D1Database, opts?: { actor?: string | null; reason?: string | null; includeTables?: string[] }) {
  const tables = opts?.includeTables?.length ? opts.includeTables : EXPORTABLE_TABLE_NAMES;
  const tablePayload: Record<string, any[]> = {};
  const stats: Record<string, any> = {};
  for (const table of tables) {
    const rows = await fetchTableRows(DB, table);
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
    }),
    stats,
    tables: tablePayload,
  };
}
