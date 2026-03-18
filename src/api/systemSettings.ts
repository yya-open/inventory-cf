import { apiGet, apiPut, apiGetPublic } from './client';
import { readJsonStorage, writeJsonStorage } from '../utils/storage';

export type PublicSettings = {
  public_inventory_cooldown_seconds: number;
  public_inventory_auto_vibrate: boolean;
  public_inventory_mobile_compact: boolean;
  public_inventory_continuous_mode_default: boolean;
  public_inventory_retry_hint: boolean;
};

export type SystemSettings = PublicSettings & {
  ui_default_page_size: number;
};

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  ui_default_page_size: 50,
  public_inventory_cooldown_seconds: 30,
  public_inventory_auto_vibrate: true,
  public_inventory_mobile_compact: true,
  public_inventory_continuous_mode_default: true,
  public_inventory_retry_hint: true,
};

const SETTINGS_CACHE_KEY = 'inventory:system-settings-cache';

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

export async function fetchSystemSettings() {
  const result: any = await apiGet('/api/system-settings');
  return cacheSystemSettings(result?.data || {});
}

export async function saveSystemSettings(payload: Partial<SystemSettings>) {
  const result: any = await apiPut('/api/system-settings', payload);
  return cacheSystemSettings(result?.data || payload || {});
}

export async function fetchPublicSettings() {
  const result: any = await apiGetPublic('/api/public/config');
  return mergeSystemSettings(result?.data || {});
}
