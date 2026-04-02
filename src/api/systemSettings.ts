import { apiGet, apiPut, apiGetPublic } from './client';
import { readJsonStorage, writeJsonStorage } from '../utils/storage';

export type PublicScanMode = 'manual' | 'scanner' | 'camera';

export type PublicSettings = {
  public_inventory_cooldown_seconds: number;
  public_inventory_auto_vibrate: boolean;
  public_inventory_mobile_compact: boolean;
  public_inventory_continuous_mode_default: boolean;
  public_inventory_retry_hint: boolean;
  public_inventory_scan_mode_default: PublicScanMode;
};

export type SystemSettings = PublicSettings & {
  ui_default_page_size: number;
  asset_allow_physical_delete: boolean;
  pc_scrap_warning_years: number;
  asset_archive_reason_options: string[];
  dictionary_department_options: string[];
  dictionary_pc_brand_options: string[];
  dictionary_monitor_brand_options: string[];
  dictionary_asset_warehouse_options: string[];
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
  dictionary_asset_warehouse_options: ['配件仓', '电脑仓', '显示器仓'],
  settings_updated_at: null,
  public_inventory_cooldown_seconds: 30,
  public_inventory_auto_vibrate: true,
  public_inventory_mobile_compact: true,
  public_inventory_continuous_mode_default: true,
  public_inventory_retry_hint: true,
  public_inventory_scan_mode_default: 'scanner',
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
