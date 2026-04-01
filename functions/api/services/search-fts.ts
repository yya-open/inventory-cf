import { normalizeSearchText } from '../_search';

type FtsTableKey = 'pc' | 'monitor' | 'audit';

type FtsMatchOptions = {
  table: 'pc_assets_fts' | 'monitor_assets_fts' | 'audit_log_fts';
  rowIdColumn: string;
};

let ensured = false;
let ensurePromise: Promise<void> | null = null;

const CREATE_SQL: Record<FtsTableKey, string[]> = {
  pc: [
    `CREATE VIRTUAL TABLE IF NOT EXISTS pc_assets_fts USING fts5(
      serial_no,
      brand,
      model,
      remark,
      disk_capacity,
      memory_size,
      search_text_norm,
      tokenize='unicode61 remove_diacritics 2',
      prefix='2 3 4 5 6'
    )`,
    `CREATE TRIGGER IF NOT EXISTS pc_assets_fts_ai AFTER INSERT ON pc_assets BEGIN
      INSERT INTO pc_assets_fts(rowid, serial_no, brand, model, remark, disk_capacity, memory_size, search_text_norm)
      VALUES (new.id, COALESCE(new.serial_no,''), COALESCE(new.brand,''), COALESCE(new.model,''), COALESCE(new.remark,''), COALESCE(new.disk_capacity,''), COALESCE(new.memory_size,''), COALESCE(new.search_text_norm,''));
    END`,
    `CREATE TRIGGER IF NOT EXISTS pc_assets_fts_au AFTER UPDATE ON pc_assets BEGIN
      DELETE FROM pc_assets_fts WHERE rowid = old.id;
      INSERT INTO pc_assets_fts(rowid, serial_no, brand, model, remark, disk_capacity, memory_size, search_text_norm)
      VALUES (new.id, COALESCE(new.serial_no,''), COALESCE(new.brand,''), COALESCE(new.model,''), COALESCE(new.remark,''), COALESCE(new.disk_capacity,''), COALESCE(new.memory_size,''), COALESCE(new.search_text_norm,''));
    END`,
    `CREATE TRIGGER IF NOT EXISTS pc_assets_fts_ad AFTER DELETE ON pc_assets BEGIN
      DELETE FROM pc_assets_fts WHERE rowid = old.id;
    END`,
  ],
  monitor: [
    `CREATE VIRTUAL TABLE IF NOT EXISTS monitor_assets_fts USING fts5(
      asset_code,
      sn,
      brand,
      model,
      size_inch,
      employee_no,
      employee_name,
      department,
      remark,
      search_text_norm,
      tokenize='unicode61 remove_diacritics 2',
      prefix='2 3 4 5 6'
    )`,
    `CREATE TRIGGER IF NOT EXISTS monitor_assets_fts_ai AFTER INSERT ON monitor_assets BEGIN
      INSERT INTO monitor_assets_fts(rowid, asset_code, sn, brand, model, size_inch, employee_no, employee_name, department, remark, search_text_norm)
      VALUES (new.id, COALESCE(new.asset_code,''), COALESCE(new.sn,''), COALESCE(new.brand,''), COALESCE(new.model,''), COALESCE(new.size_inch,''), COALESCE(new.employee_no,''), COALESCE(new.employee_name,''), COALESCE(new.department,''), COALESCE(new.remark,''), COALESCE(new.search_text_norm,''));
    END`,
    `CREATE TRIGGER IF NOT EXISTS monitor_assets_fts_au AFTER UPDATE ON monitor_assets BEGIN
      DELETE FROM monitor_assets_fts WHERE rowid = old.id;
      INSERT INTO monitor_assets_fts(rowid, asset_code, sn, brand, model, size_inch, employee_no, employee_name, department, remark, search_text_norm)
      VALUES (new.id, COALESCE(new.asset_code,''), COALESCE(new.sn,''), COALESCE(new.brand,''), COALESCE(new.model,''), COALESCE(new.size_inch,''), COALESCE(new.employee_no,''), COALESCE(new.employee_name,''), COALESCE(new.department,''), COALESCE(new.remark,''), COALESCE(new.search_text_norm,''));
    END`,
    `CREATE TRIGGER IF NOT EXISTS monitor_assets_fts_ad AFTER DELETE ON monitor_assets BEGIN
      DELETE FROM monitor_assets_fts WHERE rowid = old.id;
    END`,
  ],
  audit: [
    `CREATE VIRTUAL TABLE IF NOT EXISTS audit_log_fts USING fts5(
      username,
      action,
      entity,
      entity_id,
      target_name,
      target_code,
      summary_text,
      search_text_norm,
      tokenize='unicode61 remove_diacritics 2',
      prefix='2 3 4 5 6'
    )`,
    `CREATE TRIGGER IF NOT EXISTS audit_log_fts_ai AFTER INSERT ON audit_log BEGIN
      INSERT INTO audit_log_fts(rowid, username, action, entity, entity_id, target_name, target_code, summary_text, search_text_norm)
      VALUES (new.id, COALESCE(new.username,''), COALESCE(new.action,''), COALESCE(new.entity,''), COALESCE(new.entity_id,''), COALESCE(new.target_name,''), COALESCE(new.target_code,''), COALESCE(new.summary_text,''), COALESCE(new.search_text_norm,''));
    END`,
    `CREATE TRIGGER IF NOT EXISTS audit_log_fts_au AFTER UPDATE ON audit_log BEGIN
      DELETE FROM audit_log_fts WHERE rowid = old.id;
      INSERT INTO audit_log_fts(rowid, username, action, entity, entity_id, target_name, target_code, summary_text, search_text_norm)
      VALUES (new.id, COALESCE(new.username,''), COALESCE(new.action,''), COALESCE(new.entity,''), COALESCE(new.entity_id,''), COALESCE(new.target_name,''), COALESCE(new.target_code,''), COALESCE(new.summary_text,''), COALESCE(new.search_text_norm,''));
    END`,
    `CREATE TRIGGER IF NOT EXISTS audit_log_fts_ad AFTER DELETE ON audit_log BEGIN
      DELETE FROM audit_log_fts WHERE rowid = old.id;
    END`,
  ],
};

async function runSqlList(db: D1Database, sqlList: string[]) {
  for (const sql of sqlList) await db.prepare(sql).run();
}

async function refillFtsTable(db: D1Database, key: FtsTableKey) {
  if (key === 'pc') {
    await db.prepare(`DELETE FROM pc_assets_fts`).run().catch(() => {});
    await db.prepare(
      `INSERT INTO pc_assets_fts(rowid, serial_no, brand, model, remark, disk_capacity, memory_size, search_text_norm)
       SELECT id, COALESCE(serial_no,''), COALESCE(brand,''), COALESCE(model,''), COALESCE(remark,''), COALESCE(disk_capacity,''), COALESCE(memory_size,''), COALESCE(search_text_norm,'')
       FROM pc_assets`
    ).run();
    return;
  }
  if (key === 'monitor') {
    await db.prepare(`DELETE FROM monitor_assets_fts`).run().catch(() => {});
    await db.prepare(
      `INSERT INTO monitor_assets_fts(rowid, asset_code, sn, brand, model, size_inch, employee_no, employee_name, department, remark, search_text_norm)
       SELECT id, COALESCE(asset_code,''), COALESCE(sn,''), COALESCE(brand,''), COALESCE(model,''), COALESCE(size_inch,''), COALESCE(employee_no,''), COALESCE(employee_name,''), COALESCE(department,''), COALESCE(remark,''), COALESCE(search_text_norm,'')
       FROM monitor_assets`
    ).run();
    return;
  }
  await db.prepare(`DELETE FROM audit_log_fts`).run().catch(() => {});
  await db.prepare(
    `INSERT INTO audit_log_fts(rowid, username, action, entity, entity_id, target_name, target_code, summary_text, search_text_norm)
     SELECT id, COALESCE(username,''), COALESCE(action,''), COALESCE(entity,''), COALESCE(entity_id,''), COALESCE(target_name,''), COALESCE(target_code,''), COALESCE(summary_text,''), COALESCE(search_text_norm,'')
     FROM audit_log`
  ).run();
}

async function maybeBootstrapFtsTable(db: D1Database, key: FtsTableKey, table: string, sourceTable: string) {
  const [ftsRow, sourceRow] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).first<any>().catch(() => ({ c: 0 })),
    db.prepare(`SELECT COUNT(*) AS c FROM ${sourceTable}`).first<any>().catch(() => ({ c: 0 })),
  ]);
  if (Number(sourceRow?.c || 0) > 0 && Number(ftsRow?.c || 0) === 0) await refillFtsTable(db, key);
}

export async function ensureSearchFtsTables(db: D1Database) {
  if (ensured) return;
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await runSqlList(db, CREATE_SQL.pc);
      await runSqlList(db, CREATE_SQL.monitor);
      await runSqlList(db, CREATE_SQL.audit);
      await maybeBootstrapFtsTable(db, 'pc', 'pc_assets_fts', 'pc_assets');
      await maybeBootstrapFtsTable(db, 'monitor', 'monitor_assets_fts', 'monitor_assets');
      await maybeBootstrapFtsTable(db, 'audit', 'audit_log_fts', 'audit_log');
      ensured = true;
    })().finally(() => {
      ensurePromise = null;
    });
  }
  await ensurePromise;
}

export async function rebuildSearchFtsTables(db: D1Database, keys: FtsTableKey[] = ['pc', 'monitor', 'audit']) {
  await ensureSearchFtsTables(db);
  const wanted = Array.from(new Set(keys));
  for (const key of wanted) {
    await refillFtsTable(db, key);
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
