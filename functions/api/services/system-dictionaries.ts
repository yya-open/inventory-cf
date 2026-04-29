import { sqlNowStored } from '../_time';

export type SystemDictionaryKey = 'asset_archive_reason' | 'pc_brand' | 'monitor_brand' | 'asset_warehouse';

type LegacySettingKey = 'asset_archive_reason_options' | 'dictionary_pc_brand_options' | 'dictionary_monitor_brand_options' | 'dictionary_asset_warehouse_options';

export type SystemDictionaryItem = {
  id: number;
  dictionary_key: SystemDictionaryKey;
  label: string;
  normalized_label: string;
  sort_order: number;
  enabled: number;
  reference_count: number;
  created_at?: string;
  updated_at?: string;
  updated_by?: string | null;
};

const DEFAULT_DICTIONARY_VALUES: Record<SystemDictionaryKey, string[]> = {
  asset_archive_reason: ['停用归档', '闲置归档', '重复录入', '测试数据归档', '其他'],
  pc_brand: ['联想', '戴尔', '惠普', '华为', '苹果'],
  monitor_brand: ['联想', '戴尔', 'AOC', '飞利浦', '三星'],
  asset_warehouse: ['配件仓', '电脑仓', '显示器仓'],
};

const LEGACY_SETTING_KEYS: Record<SystemDictionaryKey, LegacySettingKey> = {
  asset_archive_reason: 'asset_archive_reason_options',
  pc_brand: 'dictionary_pc_brand_options',
  monitor_brand: 'dictionary_monitor_brand_options',
  asset_warehouse: 'dictionary_asset_warehouse_options',
};

const ALL_DICTIONARY_KEYS = Object.keys(DEFAULT_DICTIONARY_VALUES) as SystemDictionaryKey[];

const enabledLabelsCache = new Map<SystemDictionaryKey, { expiresAt: number; labels: string[] }>();
const enabledLabelsPending = new Map<SystemDictionaryKey, Promise<string[]>>();
const ENABLED_LABELS_TTL_MS = 60_000;
const SYSTEM_DICTIONARY_LIST_CACHE_TTL_MS = 5 * 60_000;
const dictionaryListCache = new Map<string, { expiresAt: number; items: SystemDictionaryItem[] }>();
const dictionaryListPending = new Map<string, Promise<SystemDictionaryItem[]>>();
const dictionaryVersionCache = new Map<string, { expiresAt: number; version: string }>();
const dictionaryVersionPending = new Map<string, Promise<string>>();
let bootstrapAllPromise: Promise<void> | null = null;
const bootstrapKeyPromises = new Map<SystemDictionaryKey, Promise<void>>();
let dictionarySchemaReady = false;
let dictionarySchemaPending: Promise<void> | null = null;

function readEnabledLabelsCache(key: SystemDictionaryKey) {
  const cached = enabledLabelsCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    enabledLabelsCache.delete(key);
    return null;
  }
  return [...cached.labels];
}

function writeEnabledLabelsCache(key: SystemDictionaryKey, labels: string[]) {
  enabledLabelsCache.set(key, { expiresAt: Date.now() + ENABLED_LABELS_TTL_MS, labels: [...labels] });
}

function clearEnabledLabelsCache(key?: SystemDictionaryKey) {
  if (key) {
    enabledLabelsCache.delete(key);
    enabledLabelsPending.delete(key);
    return;
  }
  enabledLabelsCache.clear();
  enabledLabelsPending.clear();
}

function dictionaryCacheKey(key?: SystemDictionaryKey) {
  return key || '__all__';
}

function readDictionaryListCache(key?: SystemDictionaryKey) {
  const hit = dictionaryListCache.get(dictionaryCacheKey(key));
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    dictionaryListCache.delete(dictionaryCacheKey(key));
    return null;
  }
  return hit.items.map((item) => ({ ...item }));
}

function writeDictionaryListCache(key: SystemDictionaryKey | undefined, items: SystemDictionaryItem[]) {
  dictionaryListCache.set(dictionaryCacheKey(key), {
    expiresAt: Date.now() + SYSTEM_DICTIONARY_LIST_CACHE_TTL_MS,
    items: items.map((item) => ({ ...item })),
  });
}

function readDictionaryVersionCache(key?: SystemDictionaryKey) {
  const hit = dictionaryVersionCache.get(dictionaryCacheKey(key));
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    dictionaryVersionCache.delete(dictionaryCacheKey(key));
    return null;
  }
  return hit.version;
}

function writeDictionaryVersionCache(key: SystemDictionaryKey | undefined, version: string) {
  dictionaryVersionCache.set(dictionaryCacheKey(key), {
    expiresAt: Date.now() + SYSTEM_DICTIONARY_LIST_CACHE_TTL_MS,
    version,
  });
}

export function clearSystemDictionaryCaches(key?: SystemDictionaryKey) {
  clearEnabledLabelsCache(key);
  if (key) {
    dictionaryListCache.delete(dictionaryCacheKey(key));
    dictionaryListPending.delete(dictionaryCacheKey(key));
    dictionaryVersionCache.delete(dictionaryCacheKey(key));
    dictionaryVersionPending.delete(dictionaryCacheKey(key));
  }
  dictionaryListCache.delete(dictionaryCacheKey(undefined));
  dictionaryListPending.delete(dictionaryCacheKey(undefined));
  dictionaryVersionCache.delete(dictionaryCacheKey(undefined));
  dictionaryVersionPending.delete(dictionaryCacheKey(undefined));
}

export function invalidateSystemDictionaryReferenceCache() {
  // 已升级为持久计数表 + dirty-key 延迟刷新；保留兼容导出。
}

function normalizeLabel(value: any) {
  return String(value || '').trim();
}

function normalizeComparable(value: any) {
  return normalizeLabel(value).toLowerCase();
}

function normalizeVersion(value: any) {
  const version = String(value || '').trim();
  return version || null;
}

function toInt(value: any, fallback: number, min = 0, max = 999999) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function toBoolInt(value: any, fallback = 1) {
  if (value === true || value === 1 || value === '1' || value === 'true') return 1;
  if (value === false || value === 0 || value === '0' || value === 'false') return 0;
  return fallback ? 1 : 0;
}

function toStringArray(value: any, fallback: string[] = []) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n,，]/)
      : [];
  const dedup = raw
    .map((item) => normalizeLabel(item))
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index);
  return dedup.length ? dedup : [...fallback];
}

async function ensureLegacySystemSettingsTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
      updated_by TEXT
    )`
  ).run();
}

export async function ensureSystemDictionaryTable(db: D1Database) {
  if (dictionarySchemaReady) return;
  if (dictionarySchemaPending) return dictionarySchemaPending;
  dictionarySchemaPending = (async () => {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS system_dictionary_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dictionary_key TEXT NOT NULL,
      label TEXT NOT NULL,
      normalized_label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
      updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
      updated_by TEXT,
      UNIQUE(dictionary_key, normalized_label)
    )`
  ).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_system_dictionary_items_key_sort ON system_dictionary_items(dictionary_key, sort_order, id)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_system_dictionary_items_key_enabled ON system_dictionary_items(dictionary_key, enabled, sort_order, id)`).run();
  dictionarySchemaReady = true;
  })().finally(() => {
    dictionarySchemaPending = null;
  });
  return dictionarySchemaPending;
}


export async function ensureDictionaryUsageCountersTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS dictionary_usage_counters (
      dictionary_key TEXT NOT NULL,
      normalized_label TEXT NOT NULL,
      label TEXT NOT NULL,
      reference_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
      PRIMARY KEY (dictionary_key, normalized_label)
    )`
  ).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_dictionary_usage_counters_key_count ON dictionary_usage_counters(dictionary_key, reference_count DESC, normalized_label ASC)`).run();
}

export async function ensureDictionaryUsageDirtyTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS dictionary_usage_dirty_keys (
      dictionary_key TEXT PRIMARY KEY,
      dirty_since TEXT NOT NULL DEFAULT (${sqlNowStored()}),
      updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
      refresh_after TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    )`
  ).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_dictionary_usage_dirty_refresh_after ON dictionary_usage_dirty_keys(refresh_after, dirty_since)`).run();
}

export async function markSystemDictionaryUsageCountersDirty(db: D1Database, keys?: SystemDictionaryKey[], refreshAfterSeconds = 30) {
  await ensureDictionaryUsageDirtyTable(db);
  const wanted = Array.from(new Set((keys && keys.length ? keys : ALL_DICTIONARY_KEYS).filter((key): key is SystemDictionaryKey => ALL_DICTIONARY_KEYS.includes(key))));
  if (!wanted.length) return 0;
  const statements: D1PreparedStatement[] = [];
  for (const key of wanted) {
    statements.push(db.prepare(
      `INSERT INTO dictionary_usage_dirty_keys (dictionary_key, dirty_since, updated_at, refresh_after, attempt_count, last_error)
       VALUES (?, ${sqlNowStored()}, ${sqlNowStored()}, datetime('now','+8 hours', ?), 0, NULL)
       ON CONFLICT(dictionary_key) DO UPDATE SET
         dirty_since=COALESCE(dictionary_usage_dirty_keys.dirty_since, excluded.dirty_since),
         updated_at=${sqlNowStored()},
         refresh_after=CASE
           WHEN dictionary_usage_dirty_keys.refresh_after IS NULL THEN excluded.refresh_after
           WHEN dictionary_usage_dirty_keys.refresh_after > excluded.refresh_after THEN excluded.refresh_after
           ELSE dictionary_usage_dirty_keys.refresh_after
         END,
         last_error=NULL`
    ).bind(key, `+${Math.max(0, Math.min(3600, Number(refreshAfterSeconds || 0)))} seconds`));
  }
  if (statements.length) await db.batch(statements);
  return wanted.length;
}

async function listDirtyDictionaryKeys(db: D1Database, keys?: SystemDictionaryKey[]) {
  await ensureDictionaryUsageDirtyTable(db);
  const wanted = Array.from(new Set((keys && keys.length ? keys : ALL_DICTIONARY_KEYS).filter((key): key is SystemDictionaryKey => ALL_DICTIONARY_KEYS.includes(key))));
  if (!wanted.length) return [] as SystemDictionaryKey[];
  const placeholders = wanted.map(() => '?').join(',');
  const { results } = await db.prepare(
    `SELECT dictionary_key
       FROM dictionary_usage_dirty_keys
      WHERE dictionary_key IN (${placeholders})`
  ).bind(...wanted).all<any>();
  return Array.from(new Set((results || []).map((row: any) => String(row?.dictionary_key || '') as SystemDictionaryKey).filter((key) => ALL_DICTIONARY_KEYS.includes(key))));
}

async function readLegacyDictionaryValues(db: D1Database, key: SystemDictionaryKey) {
  await ensureLegacySystemSettingsTable(db);
  const legacyKey = LEGACY_SETTING_KEYS[key];
  const row = await db.prepare(`SELECT value_json FROM system_settings WHERE key=?`).bind(legacyKey).first<any>();
  if (!row) return [...DEFAULT_DICTIONARY_VALUES[key]];
  try {
    return toStringArray(JSON.parse(String(row.value_json || 'null')), DEFAULT_DICTIONARY_VALUES[key]);
  } catch {
    return toStringArray(row.value_json, DEFAULT_DICTIONARY_VALUES[key]);
  }
}

async function bootstrapDictionaryIfNeeded(db: D1Database, key: SystemDictionaryKey) {
  const existing = bootstrapKeyPromises.get(key);
  if (existing) return existing;
  const task = (async () => {
    await ensureSystemDictionaryTable(db);
    const row = await db.prepare(`SELECT COUNT(*) AS c FROM system_dictionary_items WHERE dictionary_key=?`).bind(key).first<any>();
    if (Number(row?.c || 0) > 0) return;
    const seed = await readLegacyDictionaryValues(db, key);
    for (let i = 0; i < seed.length; i += 1) {
      const label = normalizeLabel(seed[i]);
      if (!label) continue;
      await db.prepare(
        `INSERT OR IGNORE INTO system_dictionary_items (dictionary_key, label, normalized_label, sort_order, enabled)
         VALUES (?, ?, ?, ?, 1)`
      ).bind(key, label, normalizeComparable(label), i + 1).run();
    }
  })().finally(() => {
    if (bootstrapKeyPromises.get(key) === task) bootstrapKeyPromises.delete(key);
  });
  bootstrapKeyPromises.set(key, task);
  return task;
}

export async function bootstrapAllDictionaries(db: D1Database) {
  if (bootstrapAllPromise) return bootstrapAllPromise;
  bootstrapAllPromise = (async () => {
    await Promise.all(ALL_DICTIONARY_KEYS.map((key) => bootstrapDictionaryIfNeeded(db, key)));
  })().finally(() => {
    bootstrapAllPromise = null;
  });
  return bootstrapAllPromise;
}

type ReferenceCountMap = Partial<Record<SystemDictionaryKey, Record<string, number>>>;

function addCounts(target: Record<string, number>, rows: any[] | undefined | null) {
  for (const row of rows || []) {
    const label = normalizeLabel(row?.label);
    if (!label) continue;
    target[label] = Number(target[label] || 0) + Number(row?.c || 0);
  }
}

async function computeReferenceCounts(db: D1Database, keys: SystemDictionaryKey[]): Promise<ReferenceCountMap> {
  const wanted = Array.from(new Set((keys || []).filter((key): key is SystemDictionaryKey => ALL_DICTIONARY_KEYS.includes(key))));
  const counts: ReferenceCountMap = {};
  for (const key of wanted) counts[key] = {};
  if (!wanted.length) return counts;

  if (wanted.includes('pc_brand')) {
    const { results } = await db.prepare(
      `SELECT TRIM(COALESCE(brand, '')) AS label, COUNT(*) AS c
       FROM pc_assets
       GROUP BY TRIM(COALESCE(brand, ''))`
    ).all<any>();
    addCounts(counts.pc_brand as Record<string, number>, results);
  }

  if (wanted.includes('monitor_brand')) {
    const { results } = await db.prepare(
      `SELECT TRIM(COALESCE(brand, '')) AS label, COUNT(*) AS c
       FROM monitor_assets
       GROUP BY TRIM(COALESCE(brand, ''))`
    ).all<any>();
    addCounts(counts.monitor_brand as Record<string, number>, results);
  }

  if (wanted.includes('asset_archive_reason')) {
    const { results } = await db.prepare(
      `SELECT label, SUM(c) AS c
       FROM (
         SELECT TRIM(COALESCE(archived_reason, '')) AS label, COUNT(*) AS c
         FROM pc_assets
         WHERE archived=1
         GROUP BY TRIM(COALESCE(archived_reason, ''))
         UNION ALL
         SELECT TRIM(COALESCE(archived_reason, '')) AS label, COUNT(*) AS c
         FROM monitor_assets
         WHERE archived=1
         GROUP BY TRIM(COALESCE(archived_reason, ''))
       ) t
       GROUP BY label`
    ).all<any>();
    addCounts(counts.asset_archive_reason as Record<string, number>, results);
  }

  if (wanted.includes('asset_warehouse')) {
    const { results } = await db.prepare(
      `SELECT label, SUM(c) AS c
       FROM (
          SELECT '电脑仓' AS label, COUNT(*) AS c FROM pc_assets
          UNION ALL
          SELECT '显示器仓' AS label, COUNT(*) AS c FROM monitor_assets
          UNION ALL
          SELECT '配件仓' AS label, COUNT(*) AS c FROM warehouses
          UNION ALL
          SELECT TRIM(COALESCE(data_scope_value, '')) AS label, COUNT(*) AS c
          FROM users
          WHERE data_scope_type='warehouse'
          GROUP BY TRIM(COALESCE(data_scope_value, ''))
          UNION ALL
          SELECT TRIM(COALESCE(data_scope_value2, '')) AS label, COUNT(*) AS c
          FROM users
          WHERE data_scope_type='department_warehouse'
          GROUP BY TRIM(COALESCE(data_scope_value2, ''))
        ) t
        GROUP BY label`
    ).all<any>();
    addCounts(counts.asset_warehouse as Record<string, number>, results);
  }

  return counts;
}

export async function refreshSystemDictionaryUsageCounters(db: D1Database, keys?: SystemDictionaryKey[]) {
  await ensureDictionaryUsageCountersTable(db);
  await ensureDictionaryUsageDirtyTable(db);
  const wanted = Array.from(new Set((keys && keys.length ? keys : ALL_DICTIONARY_KEYS).filter((key): key is SystemDictionaryKey => ALL_DICTIONARY_KEYS.includes(key))));
  if (!wanted.length) return 0;
  const allCounts = await computeReferenceCounts(db, wanted);
  const statements: D1PreparedStatement[] = [];
  for (const key of wanted) {
    statements.push(db.prepare(`DELETE FROM dictionary_usage_counters WHERE dictionary_key=?`).bind(key));
    const rows = Object.entries(allCounts[key] || {});
    for (const [label, referenceCount] of rows) {
      const normalized = normalizeComparable(label);
      if (!normalized) continue;
      statements.push(
        db.prepare(
          `INSERT INTO dictionary_usage_counters (dictionary_key, normalized_label, label, reference_count, updated_at)
           VALUES (?, ?, ?, ?, ${sqlNowStored()})`
        ).bind(key, normalized, label, Number(referenceCount || 0))
      );
    }
    statements.push(db.prepare(`DELETE FROM dictionary_usage_dirty_keys WHERE dictionary_key=?`).bind(key));
  }
  if (statements.length) await db.batch(statements);
  return wanted.length;
}

export async function refreshDirtySystemDictionaryUsageCounters(db: D1Database, keys?: SystemDictionaryKey[]) {
  await ensureDictionaryUsageDirtyTable(db);
  const wanted = Array.from(new Set((keys && keys.length ? keys : ALL_DICTIONARY_KEYS).filter((key): key is SystemDictionaryKey => ALL_DICTIONARY_KEYS.includes(key))));
  if (!wanted.length) return 0;
  const placeholders = wanted.map(() => '?').join(',');
  const { results } = await db.prepare(
    `SELECT dictionary_key
       FROM dictionary_usage_dirty_keys
      WHERE dictionary_key IN (${placeholders})
        AND (refresh_after IS NULL OR refresh_after <= ${sqlNowStored()})
      ORDER BY dirty_since ASC`
  ).bind(...wanted).all<any>();
  const dueKeys = Array.from(new Set((results || []).map((row: any) => String(row?.dictionary_key || '') as SystemDictionaryKey).filter((key) => ALL_DICTIONARY_KEYS.includes(key))));
  if (!dueKeys.length) return 0;
  return refreshSystemDictionaryUsageCounters(db, dueKeys);
}

export async function syncSystemDictionaryUsageCounters(db: D1Database, keys?: SystemDictionaryKey[]) {
  return markSystemDictionaryUsageCountersDirty(db, keys);
}

async function loadReferenceCounts(db: D1Database, keys: SystemDictionaryKey[]): Promise<ReferenceCountMap> {
  await ensureDictionaryUsageCountersTable(db);
  const wanted = Array.from(new Set((keys || []).filter((key): key is SystemDictionaryKey => ALL_DICTIONARY_KEYS.includes(key))));
  if (!wanted.length) return {};
  const placeholders = wanted.map(() => '?').join(',');
  let { results } = await db.prepare(
    `SELECT dictionary_key, label, reference_count
     FROM dictionary_usage_counters
     WHERE dictionary_key IN (${placeholders})`
  ).bind(...wanted).all<any>();
  const existingKeys = new Set((results || []).map((row: any) => String(row?.dictionary_key || '')).filter(Boolean));
  const refreshedDirty = await refreshDirtySystemDictionaryUsageCounters(db, wanted);
  const missingKeys = wanted.filter((key) => !existingKeys.has(key));
  if (missingKeys.length) {
    await refreshSystemDictionaryUsageCounters(db, missingKeys);
  }
  if (refreshedDirty > 0 || missingKeys.length) {
    ({ results } = await db.prepare(
      `SELECT dictionary_key, label, reference_count
       FROM dictionary_usage_counters
       WHERE dictionary_key IN (${placeholders})`
    ).bind(...wanted).all<any>());
  }
  const counts: ReferenceCountMap = {};
  for (const key of wanted) counts[key] = {};
  for (const row of results || []) {
    const key = String(row?.dictionary_key || '') as SystemDictionaryKey;
    const label = normalizeLabel(row?.label);
    if (!key || !label) continue;
    (counts[key] ||= {})[label] = Number(row?.reference_count || 0);
  }
  return counts;
}

async function getReferenceCount(db: D1Database, key: SystemDictionaryKey, label: string) {
  const normalizedLabel = normalizeLabel(label);
  if (!normalizedLabel) return 0;
  const counts = await loadReferenceCounts(db, [key]);
  return Number(counts[key]?.[normalizedLabel] || 0);
}

function normalizeRow(row: any, reference_count = 0): SystemDictionaryItem {
  return {
    id: Number(row?.id || 0),
    dictionary_key: String(row?.dictionary_key || '') as SystemDictionaryKey,
    label: normalizeLabel(row?.label),
    normalized_label: normalizeComparable(row?.label),
    sort_order: toInt(row?.sort_order, 0, 0, 999999),
    enabled: toBoolInt(row?.enabled, 1),
    reference_count: toInt(reference_count, 0, 0, 999999999),
    created_at: row?.created_at || undefined,
    updated_at: normalizeVersion(row?.updated_at) || undefined,
    updated_by: row?.updated_by || null,
  };
}

export async function listSystemDictionaryItems(db: D1Database, key?: SystemDictionaryKey) {
  const cacheKey = dictionaryCacheKey(key);
  const cached = readDictionaryListCache(key);
  if (cached) return cached;
  const pending = dictionaryListPending.get(cacheKey);
  if (pending) return pending;
  const task = (async () => {
    if (key) await bootstrapDictionaryIfNeeded(db, key);
    else await bootstrapAllDictionaries(db);
    const binds = key ? [key] : [];
    const where = key ? `WHERE dictionary_key=?` : '';
    const { results } = await db.prepare(
      `SELECT id, dictionary_key, label, normalized_label, sort_order, enabled, created_at, updated_at, updated_by
       FROM system_dictionary_items
       ${where}
       ORDER BY dictionary_key ASC, sort_order ASC, id ASC`
    ).bind(...binds).all<any>();
    const rows = results || [];
    const keys = Array.from(new Set(rows.map((row: any) => String(row?.dictionary_key || '') as SystemDictionaryKey)));
    const referenceCounts = await loadReferenceCounts(db, keys);
    const items = rows.map((row: any) => {
      const dictionaryKey = String(row?.dictionary_key || '') as SystemDictionaryKey;
      const label = normalizeLabel(row?.label);
      const referenceCount = Number(referenceCounts[dictionaryKey]?.[label] || 0);
      return normalizeRow(row, referenceCount);
    });
    writeDictionaryListCache(key, items);
    return items;
  })().finally(() => {
    dictionaryListPending.delete(cacheKey);
  });
  dictionaryListPending.set(cacheKey, task);
  return task;
}

export async function getSystemDictionaryVersion(db: D1Database, key?: SystemDictionaryKey) {
  const cacheKey = dictionaryCacheKey(key);
  const cached = readDictionaryVersionCache(key);
  if (cached) return cached;
  const pending = dictionaryVersionPending.get(cacheKey);
  if (pending) return pending;
  const task = (async () => {
    if (key) await bootstrapDictionaryIfNeeded(db, key);
    else await bootstrapAllDictionaries(db);
    const binds = key ? [key] : [];
    const where = key ? 'WHERE dictionary_key=?' : '';
    const row = await db.prepare(
      `SELECT COUNT(*) AS item_count,
              COALESCE(SUM(enabled), 0) AS enabled_count,
              COALESCE(MAX(updated_at), '') AS latest_updated_at
         FROM system_dictionary_items
         ${where}`
    ).bind(...binds).first<any>();
    const itemCount = Number(row?.item_count || 0);
    const enabledCount = Number(row?.enabled_count || 0);
    const latestUpdatedAt = String(row?.latest_updated_at || '').trim() || '0';
    const version = `dict:${key || 'all'}:${itemCount}:${enabledCount}:${latestUpdatedAt}`;
    writeDictionaryVersionCache(key, version);
    return version;
  })().finally(() => {
    dictionaryVersionPending.delete(cacheKey);
  });
  dictionaryVersionPending.set(cacheKey, task);
  return task;
}

export async function getEnabledDictionaryLabels(db: D1Database, key: SystemDictionaryKey) {
  const cached = readEnabledLabelsCache(key);
  if (cached) return cached;
  const pending = enabledLabelsPending.get(key);
  if (pending) return pending;
  const task = (async () => {
    await bootstrapDictionaryIfNeeded(db, key);
    const { results } = await db.prepare(
      `SELECT label
       FROM system_dictionary_items
       WHERE dictionary_key=? AND enabled=1
       ORDER BY sort_order ASC, id ASC`
    ).bind(key).all<any>();
    const labels = (results || []).map((row: any) => normalizeLabel(row?.label)).filter(Boolean);
    const finalLabels = labels.length ? labels : [...DEFAULT_DICTIONARY_VALUES[key]];
    writeEnabledLabelsCache(key, finalLabels);
    return finalLabels;
  })().finally(() => {
    enabledLabelsPending.delete(key);
  });
  enabledLabelsPending.set(key, task);
  return task;
}

export async function createSystemDictionaryItem(db: D1Database, input: Partial<SystemDictionaryItem>, updatedBy: string | null) {
  const key = String(input?.dictionary_key || '').trim() as SystemDictionaryKey;
  if (!ALL_DICTIONARY_KEYS.includes(key)) throw Object.assign(new Error('字典类型不支持'), { status: 400 });
  await bootstrapDictionaryIfNeeded(db, key);
  const label = normalizeLabel(input?.label);
  if (!label) throw Object.assign(new Error('字典值不能为空'), { status: 400 });
  if (label.length > 120) throw Object.assign(new Error('字典值过长'), { status: 400 });
  const normalized = normalizeComparable(label);
  const dup = await db.prepare(`SELECT id FROM system_dictionary_items WHERE dictionary_key=? AND normalized_label=?`).bind(key, normalized).first<any>();
  if (dup) throw Object.assign(new Error('该字典值已存在'), { status: 400 });
  const maxSort = await db.prepare(`SELECT MAX(sort_order) AS max_sort FROM system_dictionary_items WHERE dictionary_key=?`).bind(key).first<any>();
  const sortOrder = toInt(input?.sort_order, Number(maxSort?.max_sort || 0) + 10, 0, 999999);
  const enabled = toBoolInt(input?.enabled, 1);
  const result = await db.prepare(
    `INSERT INTO system_dictionary_items (dictionary_key, label, normalized_label, sort_order, enabled, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(key, label, normalized, sortOrder, enabled, updatedBy || null).run();
  const id = Number(result?.meta?.last_row_id || 0);
  clearSystemDictionaryCaches(key);
  return getSystemDictionaryItemById(db, id);
}

export async function getSystemDictionaryItemById(db: D1Database, id: number) {
  await ensureSystemDictionaryTable(db);
  const row = await db.prepare(
    `SELECT id, dictionary_key, label, normalized_label, sort_order, enabled, created_at, updated_at, updated_by
     FROM system_dictionary_items WHERE id=?`
  ).bind(id).first<any>();
  if (!row) throw Object.assign(new Error('字典项不存在'), { status: 404 });
  return normalizeRow(row, await getReferenceCount(db, String(row.dictionary_key) as SystemDictionaryKey, row.label));
}

export async function updateSystemDictionaryItem(db: D1Database, input: Partial<SystemDictionaryItem>, updatedBy: string | null) {
  const id = Number(input?.id || 0);
  if (!id) throw Object.assign(new Error('缺少字典项ID'), { status: 400 });
  const old = await getSystemDictionaryItemById(db, id);
  const expectedUpdatedAt = normalizeVersion(input?.updated_at);
  if (expectedUpdatedAt && normalizeVersion(old.updated_at) && expectedUpdatedAt !== normalizeVersion(old.updated_at)) {
    throw Object.assign(new Error('字典项已被其他管理员修改，请刷新后重试'), { status: 409 });
  }
  const key = (String(input?.dictionary_key || old.dictionary_key).trim() || old.dictionary_key) as SystemDictionaryKey;
  if (!ALL_DICTIONARY_KEYS.includes(key)) throw Object.assign(new Error('字典类型不支持'), { status: 400 });
  const label = normalizeLabel(input?.label ?? old.label);
  if (!label) throw Object.assign(new Error('字典值不能为空'), { status: 400 });
  if (label.length > 120) throw Object.assign(new Error('字典值过长'), { status: 400 });
  const normalized = normalizeComparable(label);
  const dup = await db.prepare(`SELECT id FROM system_dictionary_items WHERE dictionary_key=? AND normalized_label=? AND id<>?`).bind(key, normalized, id).first<any>();
  if (dup) throw Object.assign(new Error('该字典值已存在'), { status: 400 });
  const sortOrder = toInt(input?.sort_order, old.sort_order, 0, 999999);
  const enabled = toBoolInt(input?.enabled, old.enabled);
  const result = await db.prepare(
    `UPDATE system_dictionary_items
     SET dictionary_key=?, label=?, normalized_label=?, sort_order=?, enabled=?, updated_at=${sqlNowStored()}, updated_by=?
     WHERE id=? AND updated_at=?`
  ).bind(key, label, normalized, sortOrder, enabled, updatedBy || null, id, normalizeVersion(old.updated_at)).run();
  if (Number((result as any)?.meta?.changes || 0) === 0) {
    throw Object.assign(new Error('字典项已被其他管理员修改，请刷新后重试'), { status: 409 });
  }
  clearSystemDictionaryCaches(key);
  if (old.dictionary_key !== key) clearSystemDictionaryCaches(old.dictionary_key);
  return getSystemDictionaryItemById(db, id);
}


export async function reorderSystemDictionaryItems(
  db: D1Database,
  key: SystemDictionaryKey,
  orderedItems: Array<number | Partial<Pick<SystemDictionaryItem, 'id' | 'updated_at'>>>,
  updatedBy: string | null,
) {
  if (!ALL_DICTIONARY_KEYS.includes(key)) throw Object.assign(new Error('字典类型不支持'), { status: 400 });
  await bootstrapDictionaryIfNeeded(db, key);
  const { results } = await db.prepare(
    `SELECT id, updated_at FROM system_dictionary_items WHERE dictionary_key=? ORDER BY sort_order ASC, id ASC`
  ).bind(key).all<any>();
  const currentRows = (results || []).map((row: any) => ({ id: Number(row?.id || 0), updated_at: normalizeVersion(row?.updated_at) }));
  const existingIds = currentRows.map((row) => row.id).filter(Boolean);
  const nextItems = (orderedItems || []).map((item: any) => ({
    id: Number(typeof item === 'number' ? item : item?.id || 0),
    updated_at: normalizeVersion(typeof item === 'number' ? null : item?.updated_at),
  })).filter((item) => item.id > 0);
  const nextIds = nextItems.map((item) => item.id);
  if (!nextIds.length) throw Object.assign(new Error('缺少排序数据'), { status: 400 });
  if (existingIds.length !== nextIds.length) throw Object.assign(new Error('排序项数量不匹配，请刷新后重试'), { status: 400 });
  const existingSet = new Set(existingIds);
  if (new Set(nextIds).size !== nextIds.length || nextIds.some((id) => !existingSet.has(id))) {
    throw Object.assign(new Error('排序数据无效，请刷新后重试'), { status: 400 });
  }
  const currentMap = new Map(currentRows.map((row) => [row.id, row.updated_at]));
  for (const item of nextItems) {
    const currentUpdatedAt = currentMap.get(item.id) || null;
    if (item.updated_at && currentUpdatedAt && item.updated_at !== currentUpdatedAt) {
      throw Object.assign(new Error('字典顺序已被其他管理员修改，请刷新后重试'), { status: 409 });
    }
  }
  const statements = nextItems.map((item, index) => db.prepare(
    `UPDATE system_dictionary_items
     SET sort_order=?, updated_at=${sqlNowStored()}, updated_by=?
     WHERE id=? AND dictionary_key=? AND updated_at=?`
  ).bind((index + 1) * 10, updatedBy || null, item.id, key, currentMap.get(item.id) || null));
  if (statements.length) {
    const results = await db.batch(statements);
    const changed = (results || []).reduce((sum: number, row: any) => sum + Number(row?.meta?.changes || 0), 0);
    if (changed !== statements.length) {
      throw Object.assign(new Error('字典顺序已被其他管理员修改，请刷新后重试'), { status: 409 });
    }
  }
  clearSystemDictionaryCaches(key);
  return listSystemDictionaryItems(db, key);
}

export async function deleteSystemDictionaryItem(db: D1Database, id: number, expectedUpdatedAt?: string | null) {
  const row = await getSystemDictionaryItemById(db, id);
  if (expectedUpdatedAt && normalizeVersion(row.updated_at) && normalizeVersion(expectedUpdatedAt) !== normalizeVersion(row.updated_at)) {
    throw Object.assign(new Error('字典项已被其他管理员修改，请刷新后重试'), { status: 409 });
  }
  if (Number(row.reference_count || 0) > 0) {
    throw Object.assign(new Error('该字典项已被引用，无法删除，可先停用'), { status: 400 });
  }
  const result = await db.prepare(`DELETE FROM system_dictionary_items WHERE id=? AND updated_at=?`).bind(id, normalizeVersion(row.updated_at)).run();
  if (Number((result as any)?.meta?.changes || 0) === 0) {
    throw Object.assign(new Error('字典项已被其他管理员修改，请刷新后重试'), { status: 409 });
  }
  clearSystemDictionaryCaches(row.dictionary_key);
  return row;
}

export function groupDictionaryItems(items: SystemDictionaryItem[]) {
  return {
    asset_archive_reason: items.filter((item) => item.dictionary_key === 'asset_archive_reason'),
    pc_brand: items.filter((item) => item.dictionary_key === 'pc_brand'),
    monitor_brand: items.filter((item) => item.dictionary_key === 'monitor_brand'),
    asset_warehouse: items.filter((item) => item.dictionary_key === 'asset_warehouse'),
  };
}
