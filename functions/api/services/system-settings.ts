import { getEnabledDictionaryLabels } from './system-dictionaries';
import { sqlNowStored } from '../_time';

export type PublicScanMode = 'manual' | 'scanner' | 'camera';

export type SystemSettings = {
  ui_default_page_size: number;
  asset_allow_physical_delete: boolean;
  pc_scrap_warning_years: number;
  asset_archive_reason_options: string[];
  dictionary_department_options: string[];
  dictionary_pc_brand_options: string[];
  dictionary_monitor_brand_options: string[];
  public_inventory_cooldown_seconds: number;
  public_inventory_auto_vibrate: boolean;
  public_inventory_mobile_compact: boolean;
  public_inventory_continuous_mode_default: boolean;
  public_inventory_retry_hint: boolean;
  public_inventory_scan_mode_default: PublicScanMode;
  settings_updated_at?: string | null;
};

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  ui_default_page_size: 50,
  asset_allow_physical_delete: true,
  pc_scrap_warning_years: 5,
  asset_archive_reason_options: ['停用归档', '闲置归档', '重复录入', '测试数据归档', '其他'],
  dictionary_department_options: [],
  dictionary_pc_brand_options: ['联想', '戴尔', '惠普', '华为', '苹果'],
  dictionary_monitor_brand_options: ['联想', '戴尔', 'AOC', '飞利浦', '三星'],
  public_inventory_cooldown_seconds: 30,
  public_inventory_auto_vibrate: true,
  public_inventory_mobile_compact: true,
  public_inventory_continuous_mode_default: true,
  public_inventory_retry_hint: true,
  public_inventory_scan_mode_default: 'scanner',
  settings_updated_at: null,
};

const DICTIONARY_SETTING_KEYS: (keyof SystemSettings)[] = [
  'asset_archive_reason_options',
  'dictionary_department_options',
  'dictionary_pc_brand_options',
  'dictionary_monitor_brand_options',
];

const SETTING_KEYS = (Object.keys(DEFAULT_SYSTEM_SETTINGS) as (keyof SystemSettings)[]).filter((key) => !DICTIONARY_SETTING_KEYS.includes(key) && key !== 'settings_updated_at');

export async function ensureSystemSettingsTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
      updated_by TEXT
    )`
  ).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_system_settings_updated_at ON system_settings(updated_at)`).run();
}

function toBoolean(value: any, fallback: boolean) {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

function toInt(value: any, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function toStringArray(value: any, fallback: string[] = []) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n,，]/)
      : [];
  const normalized = raw
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index);
  return normalized.length ? normalized : [...fallback];
}

function normalizeScanMode(value: any, fallback: PublicScanMode, legacyScanner?: any): PublicScanMode {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'manual' || raw === 'scanner' || raw === 'camera') return raw as PublicScanMode;
  if (legacyScanner !== undefined) return toBoolean(legacyScanner, true) ? 'scanner' : 'manual';
  return fallback;
}

function normalizeVersion(value: any) {
  const version = String(value || '').trim();
  return version || null;
}

export function normalizeSystemSettings(input: Partial<Record<keyof SystemSettings, any>> | null | undefined): SystemSettings {
  const source = input || {};
  return {
    ui_default_page_size: toInt(source.ui_default_page_size, DEFAULT_SYSTEM_SETTINGS.ui_default_page_size, 10, 200),
    asset_allow_physical_delete: toBoolean(source.asset_allow_physical_delete, DEFAULT_SYSTEM_SETTINGS.asset_allow_physical_delete),
    pc_scrap_warning_years: toInt(source.pc_scrap_warning_years, DEFAULT_SYSTEM_SETTINGS.pc_scrap_warning_years, 1, 5),
    asset_archive_reason_options: toStringArray(source.asset_archive_reason_options, DEFAULT_SYSTEM_SETTINGS.asset_archive_reason_options),
    dictionary_department_options: toStringArray(source.dictionary_department_options, DEFAULT_SYSTEM_SETTINGS.dictionary_department_options),
    dictionary_pc_brand_options: toStringArray(source.dictionary_pc_brand_options, DEFAULT_SYSTEM_SETTINGS.dictionary_pc_brand_options),
    dictionary_monitor_brand_options: toStringArray(source.dictionary_monitor_brand_options, DEFAULT_SYSTEM_SETTINGS.dictionary_monitor_brand_options),
    public_inventory_cooldown_seconds: toInt(source.public_inventory_cooldown_seconds, DEFAULT_SYSTEM_SETTINGS.public_inventory_cooldown_seconds, 5, 120),
    public_inventory_auto_vibrate: toBoolean(source.public_inventory_auto_vibrate, DEFAULT_SYSTEM_SETTINGS.public_inventory_auto_vibrate),
    public_inventory_mobile_compact: toBoolean(source.public_inventory_mobile_compact, DEFAULT_SYSTEM_SETTINGS.public_inventory_mobile_compact),
    public_inventory_continuous_mode_default: toBoolean(source.public_inventory_continuous_mode_default, DEFAULT_SYSTEM_SETTINGS.public_inventory_continuous_mode_default),
    public_inventory_retry_hint: toBoolean(source.public_inventory_retry_hint, DEFAULT_SYSTEM_SETTINGS.public_inventory_retry_hint),
    public_inventory_scan_mode_default: normalizeScanMode(source.public_inventory_scan_mode_default, DEFAULT_SYSTEM_SETTINGS.public_inventory_scan_mode_default, source.public_inventory_scanner_mode_default),
    settings_updated_at: normalizeVersion(source.settings_updated_at),
  };
}

async function getSystemSettingsVersion(db: D1Database) {
  await ensureSystemSettingsTable(db);
  const row = await db.prepare(`SELECT MAX(updated_at) AS updated_at FROM system_settings WHERE key IN (${SETTING_KEYS.map(() => '?').join(',')})`).bind(...SETTING_KEYS).first<any>();
  return normalizeVersion(row?.updated_at);
}

export async function getSystemSettings(db: D1Database): Promise<SystemSettings> {
  await ensureSystemSettingsTable(db);
  const rows = await db.prepare(`SELECT key, value_json, updated_at FROM system_settings WHERE key IN (${SETTING_KEYS.map(() => '?').join(',')})`).bind(...SETTING_KEYS).all<any>();
  const patch: Record<string, any> = {};
  let latestUpdatedAt: string | null = null;
  for (const row of rows?.results || []) {
    const key = String(row?.key || '').trim();
    if (!key) continue;
    try {
      patch[key] = JSON.parse(String(row?.value_json || 'null'));
    } catch {
      patch[key] = row?.value_json;
    }
    const updatedAt = normalizeVersion(row?.updated_at);
    if (updatedAt && (!latestUpdatedAt || updatedAt > latestUpdatedAt)) latestUpdatedAt = updatedAt;
  }
  patch.asset_archive_reason_options = await getEnabledDictionaryLabels(db, 'asset_archive_reason');
  patch.dictionary_department_options = await getEnabledDictionaryLabels(db, 'department');
  patch.dictionary_pc_brand_options = await getEnabledDictionaryLabels(db, 'pc_brand');
  patch.dictionary_monitor_brand_options = await getEnabledDictionaryLabels(db, 'monitor_brand');
  patch.settings_updated_at = latestUpdatedAt;
  return normalizeSystemSettings(patch as any);
}

export async function updateSystemSettings(db: D1Database, patch: Partial<SystemSettings>, updatedBy: string | null) {
  await ensureSystemSettingsTable(db);
  const expectedUpdatedAt = normalizeVersion(patch?.settings_updated_at);
  const currentVersion = await getSystemSettingsVersion(db);
  if (expectedUpdatedAt && currentVersion && expectedUpdatedAt !== currentVersion) {
    throw Object.assign(new Error('系统配置已被其他管理员更新，请刷新后重试'), { status: 409 });
  }
  const next = normalizeSystemSettings({ ...(await getSystemSettings(db)), ...patch });
  for (const key of SETTING_KEYS) {
    await db.prepare(
      `INSERT INTO system_settings (key, value_json, updated_at, updated_by)
       VALUES (?, ?, ${sqlNowStored()}, ?)
       ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=${sqlNowStored()}, updated_by=excluded.updated_by`
    ).bind(key, JSON.stringify(next[key]), updatedBy || null).run();
  }
  return getSystemSettings(db);
}

export function getPublicSettingsPayload(settings: SystemSettings) {
  return {
    public_inventory_cooldown_seconds: settings.public_inventory_cooldown_seconds,
    public_inventory_auto_vibrate: settings.public_inventory_auto_vibrate,
    public_inventory_mobile_compact: settings.public_inventory_mobile_compact,
    public_inventory_continuous_mode_default: settings.public_inventory_continuous_mode_default,
    public_inventory_retry_hint: settings.public_inventory_retry_hint,
    public_inventory_scan_mode_default: settings.public_inventory_scan_mode_default,
  };
}
