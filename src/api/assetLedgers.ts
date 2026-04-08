import { apiGet, apiGetData } from './client';
import type { AssetInventorySummary, LocationRow, MonitorAsset, MonitorFilters, PcAsset, PcFilters } from '../types/assets';
import { asArray, asNumber, asObject } from './schema';
import { getCachedResource, invalidateCachedResource } from '../utils/resourceCache';

export type PagedResponse<T> = { rows: T[]; total: number | null };

type QueryValue = string | number | null | undefined | false;


const LEDGER_CACHE_TTL_MS = 8_000;
const SUMMARY_CACHE_TTL_MS = 60_000;
const LOCATION_CACHE_TTL_MS = 60_000;

function summaryCacheKey(kind: 'pc' | 'monitor', params: Record<string, QueryValue>) {
  return `asset-summary::${kind}::${toQueryString(params)}`;
}

function locationCacheKey(enabledOnly: boolean) {
  return `asset-locations::${enabledOnly ? 'enabled' : 'all'}`;
}

export function invalidateAssetInventorySummaryCache(kind?: 'pc' | 'monitor') {
  invalidateCachedResource(kind ? `asset-summary::${kind}` : 'asset-summary');
}

function toQueryString(params: Record<string, QueryValue>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === false) return;
    qs.set(key, String(value));
  });
  return qs.toString();
}

async function fetchPaged<T>(path: string, params: Record<string, QueryValue>, totalPath?: string, signal?: AbortSignal) {
  const listRes: any = await apiGet(`${path}?${toQueryString(params)}`, { signal });
  if (!totalPath) {
    return { rows: listRes?.data || [], total: typeof listRes?.total === 'number' ? Number(listRes.total) : null } satisfies PagedResponse<T>;
  }
  const totalRes: any = await apiGet(`${totalPath}?${toQueryString(params)}`, { signal });
  const total = typeof totalRes?.total === 'number' ? Number(totalRes.total) : Number(totalRes?.data?.total || 0);
  return { rows: listRes?.data || [], total } satisfies PagedResponse<T>;
}

export async function fetchAllPages<T>(loader: (page: number, pageSize: number) => Promise<PagedResponse<T>>, pageSize = 200) {
  const rows: T[] = [];
  let page = 1;
  let total = 0;
  do {
    const result = await loader(page, pageSize);
    rows.push(...(result.rows || []));
    total = Number(result.total || 0);
    page += 1;
    if (!result.rows?.length) break;
  } while (rows.length < total && page < 999);
  return rows;
}

export function listPcAssets(filters: PcFilters, page: number, pageSize: number, fast = true, signal?: AbortSignal) {
  return fetchPaged<PcAsset>('/api/pc-assets', {
    status: filters.status,
    keyword: filters.keyword,
    archive_reason: filters.archiveReason,
    archive_mode: filters.archiveMode && filters.archiveMode !== 'active' ? filters.archiveMode : undefined,
    show_archived: filters.showArchived || filters.archiveMode !== 'active' ? '1' : undefined,
    inventory_status: filters.inventoryStatus,
    page,
    page_size: pageSize,
    fast: fast ? '1' : undefined,
  }, undefined, signal);
}

export async function countPcAssets(filters: PcFilters, signal?: AbortSignal) {
  const result: any = await apiGet(`/api/pc-assets-count?${toQueryString({ status: filters.status, keyword: filters.keyword, archive_reason: filters.archiveReason, archive_mode: filters.archiveMode && filters.archiveMode !== 'active' ? filters.archiveMode : undefined, show_archived: filters.showArchived || filters.archiveMode !== 'active' ? '1' : undefined, inventory_status: filters.inventoryStatus })}`, { signal });
  return Number(result?.total || 0);
}

export function listMonitorAssets(filters: MonitorFilters, page: number, pageSize: number, fast = true, signal?: AbortSignal) {
  return fetchPaged<MonitorAsset>('/api/monitor-assets', {
    status: filters.status,
    location_id: filters.locationId,
    keyword: filters.keyword,
    archive_reason: filters.archiveReason,
    archive_mode: filters.archiveMode && filters.archiveMode !== 'active' ? filters.archiveMode : undefined,
    show_archived: filters.showArchived || filters.archiveMode !== 'active' ? '1' : undefined,
    inventory_status: filters.inventoryStatus,
    page,
    page_size: pageSize,
    fast: fast ? '1' : undefined,
  }, undefined, signal);
}

export async function countMonitorAssets(filters: MonitorFilters, signal?: AbortSignal) {
  const result: any = await apiGet(`/api/monitor-assets-count?${toQueryString({ status: filters.status, location_id: filters.locationId, keyword: filters.keyword, archive_reason: filters.archiveReason, archive_mode: filters.archiveMode && filters.archiveMode !== 'active' ? filters.archiveMode : undefined, show_archived: filters.showArchived || filters.archiveMode !== 'active' ? '1' : undefined, inventory_status: filters.inventoryStatus })}`, { signal });
  return Number((result?.total ?? result?.data?.total) || 0);
}

export async function listEnabledLocations(signal?: AbortSignal) {
  return getCachedResource(locationCacheKey(true), async () => {
    return await apiGetData('/api/pc-locations?enabled=1', (input) => asArray(input || [], (row) => asObject(row) as unknown as LocationRow, '位置列表'), { signal });
  }, { ttlMs: LOCATION_CACHE_TTL_MS });
}

export async function listAllLocations(signal?: AbortSignal) {
  return getCachedResource(locationCacheKey(false), async () => {
    return await apiGetData('/api/pc-locations', (input) => asArray(input || [], (row) => asObject(row) as unknown as LocationRow, '位置列表'), { signal });
  }, { ttlMs: LOCATION_CACHE_TTL_MS });
}

export async function getPcAssetInventorySummary(filters: PcFilters, signal?: AbortSignal, options?: { force?: boolean }) {
  const params = {
    status: filters.status,
    keyword: filters.keyword,
    archive_reason: filters.archiveReason,
    archive_mode: filters.archiveMode && filters.archiveMode !== 'active' ? filters.archiveMode : undefined,
    show_archived: filters.showArchived || filters.archiveMode !== 'active' ? '1' : undefined,
    no_cache: options?.force ? '1' : undefined,
  } satisfies Record<string, QueryValue>;
  return getCachedResource(summaryCacheKey('pc', params), async () => {
    return await apiGetData(`/api/pc-assets-inventory-summary?${toQueryString(params)}`, (input) => {
      const row = asObject(input || {}, '电脑盘点汇总');
      return { unchecked: asNumber(row.unchecked, 0), checked_ok: asNumber(row.checked_ok, 0), checked_issue: asNumber(row.checked_issue, 0), total: asNumber(row.total, 0) } as AssetInventorySummary;
    }, { signal });
  }, { ttlMs: SUMMARY_CACHE_TTL_MS, force: Boolean(options?.force) });
}

export async function getMonitorAssetInventorySummary(filters: MonitorFilters, signal?: AbortSignal, options?: { force?: boolean }) {
  const params = {
    status: filters.status,
    location_id: filters.locationId,
    keyword: filters.keyword,
    archive_reason: filters.archiveReason,
    archive_mode: filters.archiveMode && filters.archiveMode !== 'active' ? filters.archiveMode : undefined,
    show_archived: filters.showArchived || filters.archiveMode !== 'active' ? '1' : undefined,
    no_cache: options?.force ? '1' : undefined,
  } satisfies Record<string, QueryValue>;
  return getCachedResource(summaryCacheKey('monitor', params), async () => {
    return await apiGetData(`/api/monitor-assets-inventory-summary?${toQueryString(params)}`, (input) => {
      const row = asObject(input || {}, '显示器盘点汇总');
      return { unchecked: asNumber(row.unchecked, 0), checked_ok: asNumber(row.checked_ok, 0), checked_issue: asNumber(row.checked_issue, 0), total: asNumber(row.total, 0) } as AssetInventorySummary;
    }, { signal });
  }, { ttlMs: SUMMARY_CACHE_TTL_MS, force: Boolean(options?.force) });
}
