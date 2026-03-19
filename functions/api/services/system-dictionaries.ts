import { sqlNowStored } from '../_time';

export type SystemDictionaryKey = 'asset_archive_reason' | 'department' | 'pc_brand' | 'monitor_brand';

type LegacySettingKey = 'asset_archive_reason_options' | 'dictionary_department_options' | 'dictionary_pc_brand_options' | 'dictionary_monitor_brand_options';

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
  department: [],
  pc_brand: ['联想', '戴尔', '惠普', '华为', '苹果'],
  monitor_brand: ['联想', '戴尔', 'AOC', '飞利浦', '三星'],
};

const LEGACY_SETTING_KEYS: Record<SystemDictionaryKey, LegacySettingKey> = {
  asset_archive_reason: 'asset_archive_reason_options',
  department: 'dictionary_department_options',
  pc_brand: 'dictionary_pc_brand_options',
  monitor_brand: 'dictionary_monitor_brand_options',
};

const ALL_DICTIONARY_KEYS = Object.keys(DEFAULT_DICTIONARY_VALUES) as SystemDictionaryKey[];

function normalizeLabel(value: any) {
  return String(value || '').trim();
}

function normalizeComparable(value: any) {
  return normalizeLabel(value).toLowerCase();
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
}

export async function bootstrapAllDictionaries(db: D1Database) {
  for (const key of ALL_DICTIONARY_KEYS) {
    await bootstrapDictionaryIfNeeded(db, key);
  }
}

async function getReferenceCount(db: D1Database, key: SystemDictionaryKey, label: string) {
  const normalized = normalizeLabel(label);
  if (!normalized) return 0;
  if (key === 'pc_brand') {
    const row = await db.prepare(`SELECT COUNT(*) AS c FROM pc_assets WHERE TRIM(COALESCE(brand, ''))=?`).bind(normalized).first<any>();
    return Number(row?.c || 0);
  }
  if (key === 'monitor_brand') {
    const row = await db.prepare(`SELECT COUNT(*) AS c FROM monitor_assets WHERE TRIM(COALESCE(brand, ''))=?`).bind(normalized).first<any>();
    return Number(row?.c || 0);
  }
  if (key === 'asset_archive_reason') {
    const row = await db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM pc_assets WHERE archived=1 AND TRIM(COALESCE(archived_reason, ''))=?)
       + (SELECT COUNT(*) FROM monitor_assets WHERE archived=1 AND TRIM(COALESCE(archived_reason, ''))=?) AS c`
    ).bind(normalized, normalized).first<any>();
    return Number(row?.c || 0);
  }
  const row = await db.prepare(
    `WITH latest_pc_out AS (
       SELECT o.asset_id, o.department
       FROM pc_out o
       JOIN (
         SELECT asset_id, MAX(id) AS max_id
         FROM pc_out
         GROUP BY asset_id
       ) x ON x.asset_id=o.asset_id AND x.max_id=o.id
     )
     SELECT
       (SELECT COUNT(*) FROM latest_pc_out WHERE TRIM(COALESCE(department, ''))=?)
     + (SELECT COUNT(*) FROM monitor_assets WHERE TRIM(COALESCE(department, ''))=?) AS c`
  ).bind(normalized, normalized).first<any>();
  return Number(row?.c || 0);
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
    updated_at: row?.updated_at || undefined,
    updated_by: row?.updated_by || null,
  };
}

export async function listSystemDictionaryItems(db: D1Database, key?: SystemDictionaryKey) {
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
  const data: SystemDictionaryItem[] = [];
  for (const row of rows) {
    data.push(normalizeRow(row, await getReferenceCount(db, String(row.dictionary_key) as SystemDictionaryKey, row.label)));
  }
  return data;
}

export async function getEnabledDictionaryLabels(db: D1Database, key: SystemDictionaryKey) {
  await bootstrapDictionaryIfNeeded(db, key);
  const { results } = await db.prepare(
    `SELECT label
     FROM system_dictionary_items
     WHERE dictionary_key=? AND enabled=1
     ORDER BY sort_order ASC, id ASC`
  ).bind(key).all<any>();
  const labels = (results || []).map((row: any) => normalizeLabel(row?.label)).filter(Boolean);
  return labels.length ? labels : [...DEFAULT_DICTIONARY_VALUES[key]];
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
  await db.prepare(
    `UPDATE system_dictionary_items
     SET dictionary_key=?, label=?, normalized_label=?, sort_order=?, enabled=?, updated_at=${sqlNowStored()}, updated_by=?
     WHERE id=?`
  ).bind(key, label, normalized, sortOrder, enabled, updatedBy || null, id).run();
  return getSystemDictionaryItemById(db, id);
}

export async function deleteSystemDictionaryItem(db: D1Database, id: number) {
  const row = await getSystemDictionaryItemById(db, id);
  if (Number(row.reference_count || 0) > 0) {
    throw Object.assign(new Error('该字典项已被引用，无法删除，可先停用'), { status: 400 });
  }
  await db.prepare(`DELETE FROM system_dictionary_items WHERE id=?`).bind(id).run();
  return row;
}

export function groupDictionaryItems(items: SystemDictionaryItem[]) {
  return {
    asset_archive_reason: items.filter((item) => item.dictionary_key === 'asset_archive_reason'),
    department: items.filter((item) => item.dictionary_key === 'department'),
    pc_brand: items.filter((item) => item.dictionary_key === 'pc_brand'),
    monitor_brand: items.filter((item) => item.dictionary_key === 'monitor_brand'),
  };
}
