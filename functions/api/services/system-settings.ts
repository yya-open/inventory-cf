import { getEnabledDictionaryLabels } from './system-dictionaries';
import { sqlNowStored } from '../_time';

export type PublicScanMode = 'manual' | 'scanner' | 'camera';
export type QrContentStrategy = 'public_link' | 'short_query' | 'custom_text';
export type ExportQrFileNameMode = 'simple' | 'date' | 'scope_template';
export type ExportQrZipEntryNameMode = 'page' | 'asset';

export type SystemSettings = {
  ui_default_page_size: number;
  ui_write_local_refresh: boolean;
  asset_allow_physical_delete: boolean;
  pc_scrap_warning_years: number;
  validation_employee_no_pattern: string;
  validation_serial_no_uppercase: boolean;
  validation_remark_max_length: number;
  asset_archive_reason_options: string[];
  dictionary_pc_brand_options: string[];
  dictionary_monitor_brand_options: string[];
  dictionary_asset_warehouse_options: string[];
  public_inventory_cooldown_seconds: number;
  public_inventory_auto_vibrate: boolean;
  public_inventory_mobile_compact: boolean;
  public_inventory_continuous_mode_default: boolean;
  public_inventory_retry_hint: boolean;
  public_inventory_scan_mode_default: PublicScanMode;
  public_inventory_recent_targets_limit: number;
  public_inventory_camera_auto_start: boolean;
  public_asset_show_updated_at: boolean;
  qr_default_printer_profile: 'generic_300' | 'brother_300' | 'deli_203' | 'gprinter_203';
  qr_default_pc_cards_label_preset: 'none' | '40x30' | '50x30' | '60x40' | '70x50';
  qr_default_pc_cards_content_mode: 'detail' | 'qr_only' | 'model_sn' | 'model_asset';
  qr_default_pc_sheet_label_preset: 'none' | '40x30' | '50x30' | '60x40' | '70x50';
  qr_default_pc_sheet_content_mode: 'detail' | 'qr_only' | 'model_sn' | 'model_asset';
  qr_default_monitor_cards_label_preset: 'none' | '40x30' | '50x30' | '60x40' | '70x50';
  qr_default_monitor_cards_content_mode: 'detail' | 'qr_only' | 'model_sn' | 'model_asset';
  qr_default_monitor_sheet_label_preset: 'none' | '40x30' | '50x30' | '60x40' | '70x50';
  qr_default_monitor_sheet_content_mode: 'detail' | 'qr_only' | 'model_sn' | 'model_asset';
  qr_content_strategy: QrContentStrategy;
  qr_public_base_url: string;
  qr_custom_prefix: string;
  warehouse_default_pc_label: string;
  warehouse_default_monitor_label: string;
  warehouse_default_archive_reason: string;
  export_qr_file_name_mode: ExportQrFileNameMode;
  export_qr_zip_entry_name_mode: ExportQrZipEntryNameMode;
  ops_enable_runtime_ddl: boolean;
  alert_threshold_error_5xx_last_24h: number;
  alert_threshold_failed_async_jobs: number;
  alert_threshold_login_failures_last_24h: number;
  settings_updated_at?: string | null;
};

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  ui_default_page_size: 50,
  ui_write_local_refresh: true,
  asset_allow_physical_delete: true,
  pc_scrap_warning_years: 5,
  validation_employee_no_pattern: '^[A-Za-z0-9_-]{3,32}$',
  validation_serial_no_uppercase: true,
  validation_remark_max_length: 500,
  asset_archive_reason_options: ['停用归档', '闲置归档', '重复录入', '测试数据归档', '其他'],
  dictionary_pc_brand_options: ['联想', '戴尔', '惠普', '华为', '苹果'],
  dictionary_monitor_brand_options: ['联想', '戴尔', 'AOC', '飞利浦', '三星'],
  dictionary_asset_warehouse_options: ['配件仓', '电脑仓', '显示器仓'],
  public_inventory_cooldown_seconds: 30,
  public_inventory_auto_vibrate: true,
  public_inventory_mobile_compact: true,
  public_inventory_continuous_mode_default: true,
  public_inventory_retry_hint: true,
  public_inventory_scan_mode_default: 'scanner',
  public_inventory_recent_targets_limit: 8,
  public_inventory_camera_auto_start: false,
  public_asset_show_updated_at: true,
  qr_default_printer_profile: 'generic_300',
  qr_default_pc_cards_label_preset: '60x40',
  qr_default_pc_cards_content_mode: 'model_sn',
  qr_default_pc_sheet_label_preset: '60x40',
  qr_default_pc_sheet_content_mode: 'qr_only',
  qr_default_monitor_cards_label_preset: '60x40',
  qr_default_monitor_cards_content_mode: 'model_asset',
  qr_default_monitor_sheet_label_preset: '60x40',
  qr_default_monitor_sheet_content_mode: 'qr_only',
  qr_content_strategy: 'public_link',
  qr_public_base_url: '',
  qr_custom_prefix: 'ASSET:',
  warehouse_default_pc_label: '电脑仓',
  warehouse_default_monitor_label: '显示器仓',
  warehouse_default_archive_reason: '停用归档',
  export_qr_file_name_mode: 'scope_template',
  export_qr_zip_entry_name_mode: 'asset',
  ops_enable_runtime_ddl: false,
  alert_threshold_error_5xx_last_24h: 10,
  alert_threshold_failed_async_jobs: 20,
  alert_threshold_login_failures_last_24h: 30,
  settings_updated_at: null,
};

const DICTIONARY_SETTING_KEYS: (keyof SystemSettings)[] = [
  'asset_archive_reason_options',
  'dictionary_pc_brand_options',
  'dictionary_monitor_brand_options',
  'dictionary_asset_warehouse_options',
];

const SETTING_KEYS = (Object.keys(DEFAULT_SYSTEM_SETTINGS) as (keyof SystemSettings)[]).filter((key) => !DICTIONARY_SETTING_KEYS.includes(key) && key !== 'settings_updated_at');

const SYSTEM_SETTINGS_CACHE_TTL_MS = 5 * 60_000;
let systemSettingsCache: { expiresAt: number; value?: SystemSettings; pending?: Promise<SystemSettings> } | null = null;
let systemSettingsTablesReady = false;
let systemSettingsTablesPending: Promise<void> | null = null;

async function ensureSystemSettingsTableInner(db: D1Database) {
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

async function ensureSystemSettingsMetaTableInner(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS system_settings_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL DEFAULT 0,
      settings_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
      updated_by TEXT
    )`
  ).run();
  await db.prepare(`INSERT OR IGNORE INTO system_settings_meta (id, version, settings_json) VALUES (1, 0, '{}')`).run();
}

async function ensureSystemSettingsTables(db: D1Database) {
  if (systemSettingsTablesReady) return;
  if (systemSettingsTablesPending) return systemSettingsTablesPending;
  systemSettingsTablesPending = (async () => {
    await ensureSystemSettingsTableInner(db);
    await ensureSystemSettingsMetaTableInner(db);
    systemSettingsTablesReady = true;
  })().finally(() => {
    systemSettingsTablesPending = null;
  });
  return systemSettingsTablesPending;
}

export async function ensureSystemSettingsTable(db: D1Database) {
  await ensureSystemSettingsTables(db);
}

export async function ensureSystemSettingsMetaTable(db: D1Database) {
  await ensureSystemSettingsTables(db);
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

function normalizeQrContentStrategy(value: any, fallback: QrContentStrategy): QrContentStrategy {
  const raw = String(value || '').trim();
  return raw === 'short_query' || raw === 'custom_text' ? raw : fallback;
}

function normalizeExportQrFileNameMode(value: any, fallback: ExportQrFileNameMode): ExportQrFileNameMode {
  const raw = String(value || '').trim();
  return raw === 'date' || raw === 'scope_template' ? raw : fallback;
}

function normalizeExportQrZipEntryNameMode(value: any, fallback: ExportQrZipEntryNameMode): ExportQrZipEntryNameMode {
  const raw = String(value || '').trim();
  return raw === 'asset' ? raw : fallback;
}

function normalizeLabelPreset(value: any, fallback: SystemSettings['qr_default_pc_cards_label_preset']) {
  const raw = String(value || '').trim();
  return raw === '40x30' || raw === '50x30' || raw === '60x40' || raw === '70x50' || raw === 'none' ? raw as SystemSettings['qr_default_pc_cards_label_preset'] : fallback;
}

function normalizeContentMode(value: any, fallback: SystemSettings['qr_default_pc_cards_content_mode']) {
  const raw = String(value || '').trim();
  return raw === 'qr_only' || raw === 'model_sn' || raw === 'model_asset' ? raw as SystemSettings['qr_default_pc_cards_content_mode'] : fallback;
}

function normalizePrinterProfile(value: any, fallback: SystemSettings['qr_default_printer_profile']) {
  const raw = String(value || '').trim();
  return raw === 'brother_300' || raw === 'deli_203' || raw === 'gprinter_203' || raw === 'generic_300' ? raw as SystemSettings['qr_default_printer_profile'] : fallback;
}

export function normalizeSystemSettings(input: Partial<Record<keyof SystemSettings, any>> | null | undefined): SystemSettings {
  const source = input || {};
  return {
    ui_default_page_size: toInt(source.ui_default_page_size, DEFAULT_SYSTEM_SETTINGS.ui_default_page_size, 10, 200),
    ui_write_local_refresh: toBoolean(source.ui_write_local_refresh, DEFAULT_SYSTEM_SETTINGS.ui_write_local_refresh),
    asset_allow_physical_delete: toBoolean(source.asset_allow_physical_delete, DEFAULT_SYSTEM_SETTINGS.asset_allow_physical_delete),
    pc_scrap_warning_years: toInt(source.pc_scrap_warning_years, DEFAULT_SYSTEM_SETTINGS.pc_scrap_warning_years, 1, 5),
    validation_employee_no_pattern: String(source.validation_employee_no_pattern || DEFAULT_SYSTEM_SETTINGS.validation_employee_no_pattern).trim() || DEFAULT_SYSTEM_SETTINGS.validation_employee_no_pattern,
    validation_serial_no_uppercase: toBoolean(source.validation_serial_no_uppercase, DEFAULT_SYSTEM_SETTINGS.validation_serial_no_uppercase),
    validation_remark_max_length: toInt(source.validation_remark_max_length, DEFAULT_SYSTEM_SETTINGS.validation_remark_max_length, 50, 2000),
    asset_archive_reason_options: toStringArray(source.asset_archive_reason_options, DEFAULT_SYSTEM_SETTINGS.asset_archive_reason_options),
    dictionary_pc_brand_options: toStringArray(source.dictionary_pc_brand_options, DEFAULT_SYSTEM_SETTINGS.dictionary_pc_brand_options),
    dictionary_monitor_brand_options: toStringArray(source.dictionary_monitor_brand_options, DEFAULT_SYSTEM_SETTINGS.dictionary_monitor_brand_options),
    dictionary_asset_warehouse_options: toStringArray(source.dictionary_asset_warehouse_options, DEFAULT_SYSTEM_SETTINGS.dictionary_asset_warehouse_options),
    public_inventory_cooldown_seconds: toInt(source.public_inventory_cooldown_seconds, DEFAULT_SYSTEM_SETTINGS.public_inventory_cooldown_seconds, 5, 120),
    public_inventory_auto_vibrate: toBoolean(source.public_inventory_auto_vibrate, DEFAULT_SYSTEM_SETTINGS.public_inventory_auto_vibrate),
    public_inventory_mobile_compact: toBoolean(source.public_inventory_mobile_compact, DEFAULT_SYSTEM_SETTINGS.public_inventory_mobile_compact),
    public_inventory_continuous_mode_default: toBoolean(source.public_inventory_continuous_mode_default, DEFAULT_SYSTEM_SETTINGS.public_inventory_continuous_mode_default),
    public_inventory_retry_hint: toBoolean(source.public_inventory_retry_hint, DEFAULT_SYSTEM_SETTINGS.public_inventory_retry_hint),
    public_inventory_scan_mode_default: normalizeScanMode(source.public_inventory_scan_mode_default, DEFAULT_SYSTEM_SETTINGS.public_inventory_scan_mode_default, source.public_inventory_scanner_mode_default),
    public_inventory_recent_targets_limit: toInt(source.public_inventory_recent_targets_limit, DEFAULT_SYSTEM_SETTINGS.public_inventory_recent_targets_limit, 3, 20),
    public_inventory_camera_auto_start: toBoolean(source.public_inventory_camera_auto_start, DEFAULT_SYSTEM_SETTINGS.public_inventory_camera_auto_start),
    public_asset_show_updated_at: toBoolean(source.public_asset_show_updated_at, DEFAULT_SYSTEM_SETTINGS.public_asset_show_updated_at),
    qr_default_printer_profile: normalizePrinterProfile(source.qr_default_printer_profile, DEFAULT_SYSTEM_SETTINGS.qr_default_printer_profile),
    qr_default_pc_cards_label_preset: normalizeLabelPreset(source.qr_default_pc_cards_label_preset, DEFAULT_SYSTEM_SETTINGS.qr_default_pc_cards_label_preset),
    qr_default_pc_cards_content_mode: normalizeContentMode(source.qr_default_pc_cards_content_mode, DEFAULT_SYSTEM_SETTINGS.qr_default_pc_cards_content_mode),
    qr_default_pc_sheet_label_preset: normalizeLabelPreset(source.qr_default_pc_sheet_label_preset, DEFAULT_SYSTEM_SETTINGS.qr_default_pc_sheet_label_preset),
    qr_default_pc_sheet_content_mode: normalizeContentMode(source.qr_default_pc_sheet_content_mode, DEFAULT_SYSTEM_SETTINGS.qr_default_pc_sheet_content_mode),
    qr_default_monitor_cards_label_preset: normalizeLabelPreset(source.qr_default_monitor_cards_label_preset, DEFAULT_SYSTEM_SETTINGS.qr_default_monitor_cards_label_preset),
    qr_default_monitor_cards_content_mode: normalizeContentMode(source.qr_default_monitor_cards_content_mode, DEFAULT_SYSTEM_SETTINGS.qr_default_monitor_cards_content_mode),
    qr_default_monitor_sheet_label_preset: normalizeLabelPreset(source.qr_default_monitor_sheet_label_preset, DEFAULT_SYSTEM_SETTINGS.qr_default_monitor_sheet_label_preset),
    qr_default_monitor_sheet_content_mode: normalizeContentMode(source.qr_default_monitor_sheet_content_mode, DEFAULT_SYSTEM_SETTINGS.qr_default_monitor_sheet_content_mode),
    qr_content_strategy: normalizeQrContentStrategy(source.qr_content_strategy, DEFAULT_SYSTEM_SETTINGS.qr_content_strategy),
    qr_public_base_url: String(source.qr_public_base_url || DEFAULT_SYSTEM_SETTINGS.qr_public_base_url).trim(),
    qr_custom_prefix: String(source.qr_custom_prefix || DEFAULT_SYSTEM_SETTINGS.qr_custom_prefix).trim(),
    warehouse_default_pc_label: String(source.warehouse_default_pc_label || DEFAULT_SYSTEM_SETTINGS.warehouse_default_pc_label).trim() || DEFAULT_SYSTEM_SETTINGS.warehouse_default_pc_label,
    warehouse_default_monitor_label: String(source.warehouse_default_monitor_label || DEFAULT_SYSTEM_SETTINGS.warehouse_default_monitor_label).trim() || DEFAULT_SYSTEM_SETTINGS.warehouse_default_monitor_label,
    warehouse_default_archive_reason: String(source.warehouse_default_archive_reason || DEFAULT_SYSTEM_SETTINGS.warehouse_default_archive_reason).trim() || DEFAULT_SYSTEM_SETTINGS.warehouse_default_archive_reason,
    export_qr_file_name_mode: normalizeExportQrFileNameMode(source.export_qr_file_name_mode, DEFAULT_SYSTEM_SETTINGS.export_qr_file_name_mode),
    export_qr_zip_entry_name_mode: normalizeExportQrZipEntryNameMode(source.export_qr_zip_entry_name_mode, DEFAULT_SYSTEM_SETTINGS.export_qr_zip_entry_name_mode),
    ops_enable_runtime_ddl: toBoolean(source.ops_enable_runtime_ddl, DEFAULT_SYSTEM_SETTINGS.ops_enable_runtime_ddl),
    alert_threshold_error_5xx_last_24h: toInt(source.alert_threshold_error_5xx_last_24h, DEFAULT_SYSTEM_SETTINGS.alert_threshold_error_5xx_last_24h, 1, 100000),
    alert_threshold_failed_async_jobs: toInt(source.alert_threshold_failed_async_jobs, DEFAULT_SYSTEM_SETTINGS.alert_threshold_failed_async_jobs, 1, 100000),
    alert_threshold_login_failures_last_24h: toInt(source.alert_threshold_login_failures_last_24h, DEFAULT_SYSTEM_SETTINGS.alert_threshold_login_failures_last_24h, 1, 100000),
    settings_updated_at: normalizeVersion(source.settings_updated_at),
  };
}

function toSnapshotPayload(settings: SystemSettings) {
  return SETTING_KEYS.reduce((acc, key) => {
    acc[key] = settings[key];
    return acc;
  }, {} as Record<string, any>);
}

async function getLegacySettingsPatch(db: D1Database) {
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
  return { patch, latestUpdatedAt };
}

async function getSettingsMetaRow(db: D1Database) {
  await ensureSystemSettingsMetaTable(db);
  return db.prepare(`SELECT id, version, settings_json, updated_at FROM system_settings_meta WHERE id=1`).first<any>();
}

async function readSystemSettings(db: D1Database): Promise<SystemSettings> {
  await ensureSystemSettingsTables(db);
  const meta = await getSettingsMetaRow(db);
  let patch: Record<string, any> = {};
  let latestUpdatedAt = normalizeVersion(meta?.updated_at);
  try {
    const parsed = JSON.parse(String(meta?.settings_json || '{}'));
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) {
      patch = parsed as Record<string, any>;
    } else {
      const legacy = await getLegacySettingsPatch(db);
      patch = legacy.patch;
      latestUpdatedAt = legacy.latestUpdatedAt || latestUpdatedAt;
    }
  } catch {
    const legacy = await getLegacySettingsPatch(db);
    patch = legacy.patch;
    latestUpdatedAt = legacy.latestUpdatedAt || latestUpdatedAt;
  }
  patch.asset_archive_reason_options = await getEnabledDictionaryLabels(db, 'asset_archive_reason');
  patch.dictionary_pc_brand_options = await getEnabledDictionaryLabels(db, 'pc_brand');
  patch.dictionary_monitor_brand_options = await getEnabledDictionaryLabels(db, 'monitor_brand');
  patch.dictionary_asset_warehouse_options = await getEnabledDictionaryLabels(db, 'asset_warehouse');
  patch.settings_updated_at = latestUpdatedAt;
  return normalizeSystemSettings(patch as any);
}

export async function getSystemSettings(db: D1Database, options?: { force?: boolean }): Promise<SystemSettings> {
  const force = !!options?.force;
  const now = Date.now();
  if (!force && systemSettingsCache?.value && systemSettingsCache.expiresAt > now) return systemSettingsCache.value;
  if (!force && systemSettingsCache?.pending) return systemSettingsCache.pending;
  const pending = readSystemSettings(db).then((value) => {
    systemSettingsCache = { value, expiresAt: Date.now() + SYSTEM_SETTINGS_CACHE_TTL_MS };
    return value;
  }).finally(() => {
    if (systemSettingsCache?.pending) systemSettingsCache.pending = undefined;
  });
  systemSettingsCache = { value: systemSettingsCache?.value, expiresAt: systemSettingsCache?.expiresAt || 0, pending };
  return pending;
}

export function invalidateSystemSettingsCache() {
  systemSettingsCache = null;
}

export async function updateSystemSettings(db: D1Database, patch: Partial<SystemSettings>, updatedBy: string | null) {
  await ensureSystemSettingsTables(db);
  const expectedUpdatedAt = normalizeVersion(patch?.settings_updated_at);
  const currentMeta = await getSettingsMetaRow(db);
  const currentVersion = normalizeVersion(currentMeta?.updated_at);
  if (expectedUpdatedAt && currentVersion && expectedUpdatedAt !== currentVersion) {
    throw Object.assign(new Error('系统配置已被其他管理员更新，请刷新后重试'), { status: 409 });
  }
  const next = normalizeSystemSettings({ ...(await getSystemSettings(db)), ...patch });
  const snapshotJson = JSON.stringify(toSnapshotPayload(next));
  const result = await db.prepare(
    `UPDATE system_settings_meta
     SET version=version+1, settings_json=?, updated_at=${sqlNowStored()}, updated_by=?
     WHERE id=1 AND updated_at=?`
  ).bind(snapshotJson, updatedBy || null, currentVersion).run();
  if (Number((result as any)?.meta?.changes || 0) === 0) {
    throw Object.assign(new Error('系统配置已被其他管理员更新，请刷新后重试'), { status: 409 });
  }
  for (const key of SETTING_KEYS) {
    await db.prepare(
      `INSERT INTO system_settings (key, value_json, updated_at, updated_by)
       VALUES (?, ?, ${sqlNowStored()}, ?)
       ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=${sqlNowStored()}, updated_by=excluded.updated_by`
    ).bind(key, JSON.stringify(next[key]), updatedBy || null).run();
  }
  invalidateSystemSettingsCache();
  return getSystemSettings(db, { force: true });
}

export function getPublicSettingsPayload(settings: SystemSettings) {
  return {
    public_inventory_cooldown_seconds: settings.public_inventory_cooldown_seconds,
    public_inventory_auto_vibrate: settings.public_inventory_auto_vibrate,
    public_inventory_mobile_compact: settings.public_inventory_mobile_compact,
    public_inventory_continuous_mode_default: settings.public_inventory_continuous_mode_default,
    public_inventory_retry_hint: settings.public_inventory_retry_hint,
    public_inventory_scan_mode_default: settings.public_inventory_scan_mode_default,
    public_inventory_recent_targets_limit: settings.public_inventory_recent_targets_limit,
    public_inventory_camera_auto_start: settings.public_inventory_camera_auto_start,
    public_asset_show_updated_at: settings.public_asset_show_updated_at,
  };
}
