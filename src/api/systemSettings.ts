import { apiGet, apiPut, apiGetPublic } from './client';
import { readJsonStorage, writeJsonStorage } from '../utils/storage';

export type PublicScanMode = 'manual' | 'scanner' | 'camera';
export type QrContentStrategy = 'public_link' | 'short_query' | 'custom_text';
export type ExportQrFileNameMode = 'simple' | 'date' | 'scope_template';
export type ExportQrZipEntryNameMode = 'page' | 'asset';

export type PublicSettings = {
  public_inventory_cooldown_seconds: number;
  public_inventory_auto_vibrate: boolean;
  public_inventory_mobile_compact: boolean;
  public_inventory_continuous_mode_default: boolean;
  public_inventory_retry_hint: boolean;
  public_inventory_scan_mode_default: PublicScanMode;
  public_inventory_recent_targets_limit: number;
  public_inventory_camera_auto_start: boolean;
  public_asset_show_updated_at: boolean;
};

export type SystemSettings = PublicSettings & {
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
  public_inventory_cooldown_seconds: 30,
  public_inventory_auto_vibrate: true,
  public_inventory_mobile_compact: true,
  public_inventory_continuous_mode_default: true,
  public_inventory_retry_hint: true,
  public_inventory_scan_mode_default: 'scanner',
  public_inventory_recent_targets_limit: 8,
  public_inventory_camera_auto_start: false,
  public_asset_show_updated_at: true,
};

const SETTINGS_CACHE_KEY = 'inventory:system-settings-cache';
const SETTINGS_CLIENT_CACHE_TTL_MS = 5 * 60_000;
type SettingsCacheEntry = { expiresAt: number; value?: SystemSettings; pending?: Promise<SystemSettings> };
let settingsClientCache: SettingsCacheEntry | null = null;

const MONITOR_BRAND_DICT_REFRESH_KEY = 'inventory:monitor-brand-dict-refresh';
const MONITOR_BRAND_DICT_APPLIED_KEY = 'inventory:monitor-brand-dict-refresh-applied';

function readStorageValue(key: string) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeStorageValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function markMonitorBrandDictionaryChanged() {
  writeStorageValue(MONITOR_BRAND_DICT_REFRESH_KEY, String(Date.now()));
}

export function shouldRefreshMonitorBrandSettings() {
  return readStorageValue(MONITOR_BRAND_DICT_REFRESH_KEY) !== readStorageValue(MONITOR_BRAND_DICT_APPLIED_KEY);
}

export function markMonitorBrandSettingsApplied() {
  const marker = readStorageValue(MONITOR_BRAND_DICT_REFRESH_KEY) || String(Date.now());
  writeStorageValue(MONITOR_BRAND_DICT_APPLIED_KEY, marker);
}

export function mergeSystemSettings(input?: Partial<SystemSettings> | null): SystemSettings {
  return {
    ...DEFAULT_SYSTEM_SETTINGS,
    ...(input || {}),
  };
}

export function getCachedSystemSettings(): SystemSettings {
  return mergeSystemSettings(readJsonStorage(SETTINGS_CACHE_KEY, DEFAULT_SYSTEM_SETTINGS));
}

export function cacheSystemSettings(settings: Partial<SystemSettings>) {
  const merged = mergeSystemSettings({ ...getCachedSystemSettings(), ...(settings || {}) });
  writeJsonStorage(SETTINGS_CACHE_KEY, merged);
  return merged;
}

export async function fetchSystemSettings(options?: { force?: boolean }) {
  const force = !!options?.force;
  const now = Date.now();
  if (!force && settingsClientCache?.value && settingsClientCache.expiresAt > now) return settingsClientCache.value;
  if (!force && settingsClientCache?.pending) return settingsClientCache.pending;
  const pending = apiGet<any>(force ? '/api/system-settings?force=1' : '/api/system-settings').then((result: any) => {
    const value = cacheSystemSettings(result?.data || {});
    settingsClientCache = { value, expiresAt: Date.now() + SETTINGS_CLIENT_CACHE_TTL_MS };
    return value;
  }).finally(() => {
    if (settingsClientCache?.pending) settingsClientCache.pending = undefined;
  });
  settingsClientCache = { value: settingsClientCache?.value, expiresAt: settingsClientCache?.expiresAt || 0, pending };
  return pending;
}

export async function saveSystemSettings(payload: Partial<SystemSettings>) {
  const result: any = await apiPut('/api/system-settings', payload);
  const value = cacheSystemSettings(result?.data || payload || {});
  settingsClientCache = { value, expiresAt: Date.now() + SETTINGS_CLIENT_CACHE_TTL_MS };
  return value;
}

export async function fetchPublicSettings() {
  const result: any = await apiGetPublic('/api/public/config');
  return mergeSystemSettings(result?.data || {});
}
