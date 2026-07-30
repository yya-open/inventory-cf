import { normalizeSearchText } from '../_search';

export type FtsTableKey = 'pc' | 'monitor' | 'audit';

type FtsMatchOptions = {
  table: 'pc_assets_fts' | 'monitor_assets_fts' | 'audit_log_fts';
  rowIdColumn: string;
};

const ensuredKeys = new Set<FtsTableKey>();
const ensurePromises = new Map<FtsTableKey, Promise<void>>();

type FtsTableConfig = { source: string; fts: string; columns: string[] };

const FTS_CONFIGS: Record<FtsTableKey, FtsTableConfig> = {
  pc: { source: 'pc_assets', fts: 'pc_assets_fts', columns: ['serial_no', 'brand', 'model', 'remark', 'disk_capacity', 'memory_size', 'search_text_norm'] },
  monitor: { source: 'monitor_assets', fts: 'monitor_assets_fts', columns: ['asset_code', 'sn', 'brand', 'model', 'size_inch', 'employee_no', 'employee_name', 'department', 'remark', 'search_text_norm'] },
  audit: { source: 'audit_log', fts: 'audit_log_fts', columns: ['username', 'action', 'entity', 'entity_id', 'target_name', 'target_code', 'summary_text', 'search_text_norm'] },
};

function buildFtsCreateSql(cfg: FtsTableConfig): string[] {
  const { source, fts, columns } = cfg;
  const colList = columns.join(', ');
  const valuesNew = columns.map((c) => `COALESCE(new.${c},'')`).join(', ');
  return [
    `CREATE VIRTUAL TABLE IF NOT EXISTS ${fts} USING fts5(${colList}, tokenize='unicode61 remove_diacritics 2', prefix='2 3 4 5 6')`,
    `DROP TRIGGER IF EXISTS ${fts}_ai`,
    `DROP TRIGGER IF EXISTS ${fts}_au`,
    `DROP TRIGGER IF EXISTS ${fts}_ad`,
    `CREATE TRIGGER ${fts}_ai AFTER INSERT ON ${source} BEGIN
      INSERT OR REPLACE INTO ${fts}(rowid, ${colList}) VALUES (new.id, ${valuesNew});
    END`,
    `CREATE TRIGGER ${fts}_au AFTER UPDATE ON ${source} BEGIN
      DELETE FROM ${fts} WHERE rowid = old.id;
      INSERT OR REPLACE INTO ${fts}(rowid, ${colList}) VALUES (new.id, ${valuesNew});
    END`,
    `CREATE TRIGGER ${fts}_ad AFTER DELETE ON ${source} BEGIN
      DELETE FROM ${fts} WHERE rowid = old.id;
    END`,
  ];
}

const CREATE_SQL: Record<FtsTableKey, string[]> = {
  pc: buildFtsCreateSql(FTS_CONFIGS.pc),
  monitor: buildFtsCreateSql(FTS_CONFIGS.monitor),
  audit: buildFtsCreateSql(FTS_CONFIGS.audit),
};

async function runSqlList(db: D1Database, sqlList: string[]) {
  for (const sql of sqlList) await db.prepare(sql).run();
}

async function refillFtsTable(db: D1Database, key: FtsTableKey) {
  const cfg = FTS_CONFIGS[key];
  const colList = cfg.columns.join(', ');
  const selectCols = cfg.columns.map((c) => `COALESCE(${c},'')`).join(', ');
  await db.prepare(`DELETE FROM ${cfg.fts}`).run().catch(() => {});
  await db.prepare(
    `INSERT OR REPLACE INTO ${cfg.fts}(rowid, ${colList}) SELECT id, ${selectCols} FROM ${cfg.source}`
  ).run();
}

async function maybeBootstrapFtsTable(db: D1Database, key: FtsTableKey, table: string, sourceTable: string) {
  const [ftsRow, sourceRow] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).first<any>().catch(() => ({ c: 0 })),
    db.prepare(`SELECT COUNT(*) AS c FROM ${sourceTable}`).first<any>().catch(() => ({ c: 0 })),
  ]);
  if (Number(sourceRow?.c || 0) > 0 && Number(ftsRow?.c || 0) === 0) await refillFtsTable(db, key);
}

type FtsProbeResult = { ftsRows: number; sourceRows: number };

// 读路径只探测不建表：FTS 虚表与同步触发器由 sql/ 迁移负责创建。
// 单次 batch 同时取回「对象是否齐备」与两侧行数，避免多次串行往返。
async function probeSearchFtsReady(db: D1Database, key: FtsTableKey): Promise<FtsProbeResult | null> {
  const cfg = FTS_CONFIGS[key];
  const triggerList = ['ai', 'au', 'ad'].map((suffix) => `'${cfg.fts}_${suffix}'`).join(', ');
  try {
    const checks = await db.batch([
      // fts5 虚表在 sqlite_master 里 type 同样是 'table'
      db.prepare(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='${cfg.fts}'`),
      db.prepare(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='trigger' AND name IN (${triggerList})`),
      db.prepare(`SELECT COUNT(*) AS c FROM ${cfg.fts}`),
      db.prepare(`SELECT COUNT(*) AS c FROM ${cfg.source}`),
    ]);
    const countAt = (index: number) => Number((checks[index] as any)?.results?.[0]?.c || 0);
    if (countAt(0) < 1 || countAt(1) < 3) return null;
    return { ftsRows: countAt(2), sourceRows: countAt(3) };
  } catch {
    return null;
  }
}

async function ensureSearchFtsTable(db: D1Database, key: FtsTableKey) {
  if (ensuredKeys.has(key)) return;
  const pending = ensurePromises.get(key);
  if (pending) return pending;
  const task = (async () => {
    const probe = await probeSearchFtsReady(db, key);
    if (probe) {
      // 对象齐备推不出历史数据的回填状态，仍保留「源表有数据而 FTS 为空则回填」语义；
      // 计数已并入探测 batch，命中时不产生额外查询，也完全跳过 DDL。
      if (probe.sourceRows > 0 && probe.ftsRows === 0) await refillFtsTable(db, key);
      ensuredKeys.add(key);
      return;
    }
    await runSqlList(db, CREATE_SQL[key]);
    await maybeBootstrapFtsTable(db, key, FTS_CONFIGS[key].fts, FTS_CONFIGS[key].source);
    ensuredKeys.add(key);
  })().finally(() => {
    ensurePromises.delete(key);
  });
  ensurePromises.set(key, task);
  return task;
}

export async function ensureSearchFtsTables(db: D1Database, keys: FtsTableKey[] = ['pc', 'monitor', 'audit']) {
  const wanted = Array.from(new Set(keys));
  for (const key of wanted) await ensureSearchFtsTable(db, key);
}

export async function rebuildSearchFtsTables(db: D1Database, keys: FtsTableKey[] = ['pc', 'monitor', 'audit']) {
  const wanted = Array.from(new Set(keys));
  for (const key of wanted) {
    // ops 显式重建：绕过读路径的探测缓存，真正重建虚表与同步触发器后全量回填。
    await runSqlList(db, CREATE_SQL[key]);
    await refillFtsTable(db, key);
    ensuredKeys.add(key);
  }
}

function quoteFtsToken(token: string) {
  return `"${token.replace(/"/g, '""')}"`;
}

function normalizeFtsTokens(keywordRaw: string) {
  const normalized = normalizeSearchText(keywordRaw);
  return normalized.split(' ').map((token) => token.trim()).filter(Boolean).slice(0, 8);
}

export function buildFtsKeywordWhere(keywordRaw: string, options: FtsMatchOptions) {
  const tokens = normalizeFtsTokens(keywordRaw);
  if (!tokens.length) return { sql: '', binds: [] as any[] };
  const query = tokens
    .map((token) => token.length >= 2 ? `${quoteFtsToken(token)}*` : quoteFtsToken(token))
    .join(' AND ');
  return {
    sql: `${options.rowIdColumn} IN (SELECT rowid FROM ${options.table} WHERE ${options.table} MATCH ?)`,
    binds: [query],
  };
}
