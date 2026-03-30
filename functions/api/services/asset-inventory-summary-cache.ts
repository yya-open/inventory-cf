import { sqlNowStored } from '../_time';
import { buildMonitorAssetQuery, buildPcAssetQuery } from './asset-ledger';
import type { UserDataScope } from './data-scope';

export type CachedInventorySummary = {
  unchecked: number;
  checked_ok: number;
  checked_issue: number;
  total: number;
};

const SUMMARY_CACHE_MAX_AGE_SECONDS = 30;

type InventoryKind = 'pc' | 'monitor';

function scopeKey(scope?: UserDataScope | null) {
  return JSON.stringify({
    data_scope_type: scope?.data_scope_type || 'all',
    data_scope_value: scope?.data_scope_value || null,
    data_scope_value2: scope?.data_scope_value2 || null,
  });
}

function normalizeSummaryStatus(status: any) {
  const value = String(status || '').toUpperCase();
  if (value === 'CHECKED_OK' || value === 'CHECKED_ISSUE') return value;
  return 'UNCHECKED';
}

function buildDefaultQuery(kind: InventoryKind, scope?: UserDataScope | null) {
  const url = new URL('https://inventory.local/');
  return kind === 'pc' ? buildPcAssetQuery(url, scope) : buildMonitorAssetQuery(url, scope);
}

async function computeDefaultInventorySummary(db: D1Database, kind: InventoryKind, scope?: UserDataScope | null): Promise<CachedInventorySummary> {
  const query = buildDefaultQuery(kind, scope);
  const tableWithAlias = kind === 'pc' ? 'pc_assets a' : 'monitor_assets a';
  const { results } = await db.prepare(
    `SELECT COALESCE(a.inventory_status, 'UNCHECKED') AS inventory_status, COUNT(*) AS c
       FROM ${tableWithAlias}
       ${query.joins || ''}
       ${query.where}
      GROUP BY COALESCE(a.inventory_status, 'UNCHECKED')`
  ).bind(...query.binds).all<any>();

  const summary: CachedInventorySummary = { unchecked: 0, checked_ok: 0, checked_issue: 0, total: 0 };
  for (const row of results || []) {
    const count = Number((row as any)?.c || 0);
    const key = normalizeSummaryStatus((row as any)?.inventory_status);
    summary.total += count;
    if (key === 'CHECKED_OK') summary.checked_ok += count;
    else if (key === 'CHECKED_ISSUE') summary.checked_issue += count;
    else summary.unchecked += count;
  }
  return summary;
}

function parseCachedSummary(value: any): CachedInventorySummary | null {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return {
      unchecked: Number(parsed?.unchecked || 0),
      checked_ok: Number(parsed?.checked_ok || 0),
      checked_issue: Number(parsed?.checked_issue || 0),
      total: Number(parsed?.total || 0),
    };
  } catch {
    return null;
  }
}

export async function ensureInventorySummaryCacheTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS asset_inventory_summary_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      scope_key TEXT NOT NULL,
      cache_key TEXT NOT NULL,
      summary_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
      UNIQUE(kind, scope_key, cache_key)
    )`
  ).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_asset_inventory_summary_cache_lookup ON asset_inventory_summary_cache(kind, scope_key, cache_key, updated_at)`).run();
}

export async function invalidateInventorySummaryCache(db: D1Database, kind?: InventoryKind) {
  await ensureInventorySummaryCacheTable(db);
  if (kind) {
    await db.prepare(`DELETE FROM asset_inventory_summary_cache WHERE kind=?`).bind(kind).run();
    return;
  }
  await db.prepare(`DELETE FROM asset_inventory_summary_cache`).run();
}

async function upsertDefaultInventorySummaryCache(db: D1Database, kind: InventoryKind, scope?: UserDataScope | null) {
  const summary = await computeDefaultInventorySummary(db, kind, scope);
  await db.prepare(
    `INSERT INTO asset_inventory_summary_cache (kind, scope_key, cache_key, summary_json, updated_at)
     VALUES (?, ?, 'default', ?, ${sqlNowStored()})
     ON CONFLICT(kind, scope_key, cache_key)
     DO UPDATE SET summary_json=excluded.summary_json, updated_at=${sqlNowStored()}`
  ).bind(kind, scopeKey(scope), JSON.stringify(summary)).run();
  return summary;
}

export async function readDefaultInventorySummaryCache(db: D1Database, kind: InventoryKind, scope?: UserDataScope | null) {
  await ensureInventorySummaryCacheTable(db);
  const row = await db.prepare(
    `SELECT summary_json, updated_at FROM asset_inventory_summary_cache
      WHERE kind=? AND scope_key=? AND cache_key='default'
        AND updated_at >= datetime('now','+8 hours', ?)
      LIMIT 1`
  ).bind(kind, scopeKey(scope), `-${SUMMARY_CACHE_MAX_AGE_SECONDS} seconds`).first<any>();
  const cached = parseCachedSummary(row?.summary_json);
  if (cached) return cached;
  return upsertDefaultInventorySummaryCache(db, kind, scope);
}

export function isDefaultInventorySummaryRequest(url: URL, kind: InventoryKind) {
  const hasStatus = String(url.searchParams.get('status') || '').trim().length > 0;
  const hasKeyword = String(url.searchParams.get('keyword') || '').trim().length > 0;
  const hasArchiveReason = String(url.searchParams.get('archive_reason') || '').trim().length > 0;
  const showArchived = String(url.searchParams.get('show_archived') || '').trim() === '1';
  const archiveMode = String(url.searchParams.get('archive_mode') || '').trim().toLowerCase();
  if (hasStatus || hasKeyword || hasArchiveReason || showArchived) return false;
  if (archiveMode && archiveMode !== 'active') return false;
  if (kind === 'monitor') {
    const locationId = Number(url.searchParams.get('location_id') || 0) || 0;
    if (locationId > 0) return false;
  }
  return true;
}
