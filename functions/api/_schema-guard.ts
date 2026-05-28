/**
 * 安全的标识符校验（防 SQL 注入）
 * 只允许字母、数字、下划线，且以字母或下划线开头
 */
function safeIdentifier(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return name;
}

export async function ensureTableColumns(db: D1Database, opts: {
  table: string;
  requiredColumns: string[];
  ddlMap: Record<string, string>;
}): Promise<boolean> {
  const { table, requiredColumns, ddlMap } = opts;
  safeIdentifier(table);
  for (const col of requiredColumns) safeIdentifier(col);
  const tableRow = await db.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?`).bind(table).first<any>();
  if (Number(tableRow?.ok || 0) !== 1) return false;
  const { results } = await db.prepare(`PRAGMA table_info(?)`).bind(table).all<any>();
  const columns = new Set((results || []).map((row: any) => String(row?.name || '').trim()).filter(Boolean));
  const missingColumns = requiredColumns.filter((col) => !columns.has(col));
  if (!missingColumns.length) return true;
  const ddls = missingColumns.map((col) => ddlMap[col]).filter(Boolean);
  for (const ddl of ddls) {
    try { await db.prepare(ddl).run(); } catch {}
  }
  const verify = await db.prepare(`PRAGMA table_info(?)`).bind(table).all<any>();
  const verifyColumns = new Set((verify?.results || []).map((row: any) => String(row?.name || '').trim()).filter(Boolean));
  return requiredColumns.every((col) => verifyColumns.has(col));
}

export async function ensureTableTriggers(db: D1Database, opts: {
  table: string;
  triggerNames: string[];
  triggerSqls: string[];
}): Promise<boolean> {
  const { table, triggerNames, triggerSqls } = opts;
  safeIdentifier(table);
  for (const name of triggerNames) safeIdentifier(name);
  const tableRow = await db.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?`).bind(table).first<any>();
  if (Number(tableRow?.ok || 0) !== 1) return false;
  const placeholders = triggerNames.map(() => '?').join(',');
  const before = await db.prepare(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='trigger' AND name IN (${placeholders})`).bind(...triggerNames).first<any>();
  if (Number(before?.c || 0) >= triggerNames.length) return true;
  await db.batch(triggerSqls.map((sql) => db.prepare(sql)));
  const after = await db.prepare(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='trigger' AND name IN (${placeholders})`).bind(...triggerNames).first<any>();
  return Number(after?.c || 0) >= triggerNames.length;
}
