import { usePagedAssetList } from './usePagedAssetList';
import type { PagedResponse } from '../api/assetLedgers';

type AssetPageOptions<TFilters, TItem> = {
  createFilterKey: (filters: TFilters) => string;
  fetchPage: (filters: TFilters, page: number, pageSize: number, fast: boolean) => Promise<PagedResponse<TItem>>;
  fetchTotal: (filters: TFilters) => Promise<number>;
};

export function useAssetLedgerPage<TFilters, TItem>(options: AssetPageOptions<TFilters, TItem>) {
  const list = usePagedAssetList<TFilters, TItem>({
    createFilterKey: options.createFilterKey,
    fetchPage: ({ filters, page, pageSize, fast }) => options.fetchPage(filters, page, pageSize, fast),
    fetchTotal: options.fetchTotal,
  });

  async function fetchAll(filters: TFilters, exportPageSize = 200) {
    const rows: TItem[] = [];
    let page = 1;
    let total = 0;
    do {
      const result = await options.fetchPage(filters, page, exportPageSize, false);
      rows.push(...(result.rows || []));
      total = Number(result.total || 0);
      page += 1;
      if (!result.rows?.length) break;
    } while (rows.length < total && page < 999);
    return rows;
  }

  return {
    ...list,
    fetchAll,
  };
}
