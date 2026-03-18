import { sqlNowStored } from '../_time';

export type SystemSettings = {
  ui_default_page_size: number;
  public_inventory_cooldown_seconds: number;
  public_inventory_auto_vibrate: boolean;
  public_inventory_mobile_compact: boolean;
  public_inventory_continuous_mode_default: boolean;
  public_inventory_retry_hint: boolean;
};

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  ui_default_page_size: 50,
  public_inventory_cooldown_seconds: 30,
  public_inventory_auto_vibrate: true,
  public_inventory_mobile_compact: true,
  public_inventory_continuous_mode_default: true,
  public_inventory_retry_hint: true,
};

const SETTING_KEYS = Object.keys(DEFAULT_SYSTEM_SETTINGS) as (keyof SystemSettings)[];

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

export function normalizeSystemSettings(input: Partial<Record<keyof SystemSettings, any>> | null | undefined): SystemSettings {
  const source = input || {};
  return {
    ui_default_page_size: toInt(source.ui_default_page_size, DEFAULT_SYSTEM_SETTINGS.ui_default_page_size, 10, 200),
    public_inventory_cooldown_seconds: toInt(source.public_inventory_cooldown_seconds, DEFAULT_SYSTEM_SETTINGS.public_inventory_cooldown_seconds, 5, 120),
    public_inventory_auto_vibrate: toBoolean(source.public_inventory_auto_vibrate, DEFAULT_SYSTEM_SETTINGS.public_inventory_auto_vibrate),
    public_inventory_mobile_compact: toBoolean(source.public_inventory_mobile_compact, DEFAULT_SYSTEM_SETTINGS.public_inventory_mobile_compact),
    public_inventory_continuous_mode_default: toBoolean(source.public_inventory_continuous_mode_default, DEFAULT_SYSTEM_SETTINGS.public_inventory_continuous_mode_default),
    public_inventory_retry_hint: toBoolean(source.public_inventory_retry_hint, DEFAULT_SYSTEM_SETTINGS.public_inventory_retry_hint),
  };
}

export async function getSystemSettings(db: D1Database): Promise<SystemSettings> {
  await ensureSystemSettingsTable(db);
  const rows = await db.prepare(`SELECT key, value_json FROM system_settings WHERE key IN (${SETTING_KEYS.map(() => '?').join(',')})`).bind(...SETTING_KEYS).all<any>();
  const patch: Record<string, any> = {};
  for (const row of rows?.results || []) {
    const key = String(row?.key || '').trim();
    if (!key) continue;
    try {
      patch[key] = JSON.parse(String(row?.value_json || 'null'));
    } catch {
      patch[key] = row?.value_json;
    }
  }
  return normalizeSystemSettings(patch as any);
}

export async function updateSystemSettings(db: D1Database, patch: Partial<SystemSettings>, updatedBy: string | null) {
  await ensureSystemSettingsTable(db);
  const next = normalizeSystemSettings({ ...(await getSystemSettings(db)), ...patch });
  for (const key of SETTING_KEYS) {
    await db.prepare(
      `INSERT INTO system_settings (key, value_json, updated_at, updated_by)
       VALUES (?, ?, ${sqlNowStored()}, ?)
       ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=${sqlNowStored()}, updated_by=excluded.updated_by`
    ).bind(key, JSON.stringify(next[key]), updatedBy || null).run();
  }
  return next;
}

export function getPublicSettingsPayload(settings: SystemSettings) {
  return {
    public_inventory_cooldown_seconds: settings.public_inventory_cooldown_seconds,
    public_inventory_auto_vibrate: settings.public_inventory_auto_vibrate,
    public_inventory_mobile_compact: settings.public_inventory_mobile_compact,
    public_inventory_continuous_mode_default: settings.public_inventory_continuous_mode_default,
    public_inventory_retry_hint: settings.public_inventory_retry_hint,
  };
}
