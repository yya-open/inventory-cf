import { apiPost } from './client';

export type AssetQrLink = {
  id: number;
  key: string;
  url: string;
};

function normalizeIds(ids: Array<number | string>) {
  return Array.from(new Set(
    ids
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
  ));
}

async function fetchBulkAssetQrLinks(path: string, ids: Array<number | string>) {
  const normalizedIds = normalizeIds(ids);
  if (!normalizedIds.length) return [] as AssetQrLink[];
  const response: any = await apiPost(path, { ids: normalizedIds });
  const rows = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
  return rows
    .map((item: any) => ({
      id: Number(item?.id || 0),
      key: String(item?.key || ''),
      url: String(item?.url || '').trim(),
    }))
    .filter((item: AssetQrLink) => item.id > 0 && item.url);
}

export function fetchBulkPcAssetQrLinks(ids: Array<number | string>) {
  return fetchBulkAssetQrLinks('/api/pc-asset-qr-token-bulk', ids);
}

export function fetchBulkMonitorAssetQrLinks(ids: Array<number | string>) {
  return fetchBulkAssetQrLinks('/api/monitor-asset-qr-token-bulk', ids);
}
