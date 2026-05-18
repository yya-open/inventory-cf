export async function ensureTableColumns(db: D1Database, opts: {
  table: string;
  requiredColumns: string[];
  ddlMap: Record<string, string>;
}): Promise<boolean> {
  const { table, requiredColumns, ddlMap } = opts;
  const tableRow = await db.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='${table}'`).first<any>();
  if (Number(tableRow?.ok || 0) !== 1) return false;
  const { results } = await db.prepare(`PRAGMA table_info('${table}')`).all<any>();
  const columns = new Set((results || []).map((row: any) => String(row?.name || '').trim()).filter(Boolean));
  const missingColumns = requiredColumns.filter((col) => !columns.has(col));
  if (!missingColumns.length) return true;
  const ddls = missingColumns.map((col) => ddlMap[col]).filter(Boolean);
  for (const ddl of ddls) {
    try { await db.prepare(ddl).run(); } catch {}
  }
  const verify = await db.prepare(`PRAGMA table_info('${table}')`).all<any>();
  const verifyColumns = new Set((verify?.results || []).map((row: any) => String(row?.name || '').trim()).filter(Boolean));
  return requiredColumns.every((col) => verifyColumns.has(col));
}

export async function ensureTableTriggers(db: D1Database, opts: {
  table: string;
  triggerNames: string[];
  triggerSqls: string[];
}): Promise<boolean> {
  const { table, triggerNames, triggerSqls } = opts;
  const tableRow = await db.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='${table}'`).first<any>();
  if (Number(tableRow?.ok || 0) !== 1) return false;
  const nameList = triggerNames.map((n) => `'${n}'`).join(',');
  const before = await db.prepare(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='trigger' AND name IN (${nameList})`).first<any>();
  if (Number(before?.c || 0) >= triggerNames.length) return true;
  await db.batch(triggerSqls.map((sql) => db.prepare(sql)));
  const after = await db.prepare(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='trigger' AND name IN (${nameList})`).first<any>();
  return Number(after?.c || 0) >= triggerNames.length;
}
