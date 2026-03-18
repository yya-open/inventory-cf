import { apiGet } from './client';
import type { LocationRow, MonitorAsset, MonitorFilters, PcAsset, PcFilters } from '../types/assets';

export type PagedResponse<T> = { rows: T[]; total: number | null };

type QueryValue = string | number | null | undefined | false;

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
    page,
    page_size: pageSize,
    fast: fast ? '1' : undefined,
  }, undefined, signal);
}

export async function countPcAssets(filters: PcFilters, signal?: AbortSignal) {
  const result: any = await apiGet(`/api/pc-assets-count?${toQueryString({ status: filters.status, keyword: filters.keyword })}`, { signal });
  return Number(result?.total || 0);
}

export function listMonitorAssets(filters: MonitorFilters, page: number, pageSize: number, fast = true, signal?: AbortSignal) {
  return fetchPaged<MonitorAsset>('/api/monitor-assets', {
    status: filters.status,
    location_id: filters.locationId,
    keyword: filters.keyword,
    page,
    page_size: pageSize,
    fast: fast ? '1' : undefined,
  }, undefined, signal);
}

export async function countMonitorAssets(filters: MonitorFilters, signal?: AbortSignal) {
  const result: any = await apiGet(`/api/monitor-assets-count?${toQueryString({ status: filters.status, location_id: filters.locationId, keyword: filters.keyword })}`, { signal });
  return Number((result?.total ?? result?.data?.total) || 0);
}

export async function listEnabledLocations(signal?: AbortSignal) {
  const result: any = await apiGet('/api/pc-locations?enabled=1', { signal });
  return (result?.data || []) as LocationRow[];
}

export async function listAllLocations(signal?: AbortSignal) {
  const result: any = await apiGet('/api/pc-locations', { signal });
  return (result?.data || []) as LocationRow[];
}
