import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { useBrowserIdleTask } from './useBrowserIdleTask';

export interface InventoryBatchRefreshOptions {
  /** 资产类型标识 */
  assetType: 'pc' | 'monitor';
  /** 批量刷新延迟（毫秒） */
  batchRefreshDelayMs?: number;
  /** 空闲任务超时（毫秒） */
  idleTimeout?: number;
  /** 是否有活跃的盘点批次 */
  hasActiveInventoryBatch: ComputedRef<boolean>;
  /** 当前盘点状态 */
  inventoryStatus: Ref<string>;
  /** 盘点批次数据 */
  inventoryBatch: Ref<any>;
  /** 盘点汇总数据 */
  inventorySummary: Ref<any>;
  /** 刷新盘点批次的函数 */
  refreshInventoryBatchStore: (options: { silent: boolean; force?: boolean; ttlMs?: number }) => Promise<any>;
  /** 刷新盘点汇总的函数 */
  refreshInventorySummary: (filters?: any) => Promise<any>;
  /** 获取当前筛选条件 */
  currentFiltersForList: () => any;
  /** 禁用自动搜索的回调 */
  runWithoutAutoSearch: (fn: () => void) => void;
  /** 失效汇总缓存 */
  invalidateAssetInventorySummaryCache: (type: 'pc' | 'monitor') => void;
}

/**
 * 资产台账盘点批量刷新 composable
 * 处理盘点批次和汇总的延迟刷新逻辑
 */
export function useAssetLedgerBatchRefresh(options: InventoryBatchRefreshOptions) {
  const {
    assetType,
    batchRefreshDelayMs = 4500,
    idleTimeout = 6000,
    hasActiveInventoryBatch,
    inventoryStatus,
    inventoryBatch,
    inventorySummary,
    refreshInventoryBatchStore,
    refreshInventorySummary: refreshSummaryFn,
    currentFiltersForList,
    runWithoutAutoSearch,
    invalidateAssetInventorySummaryCache,
  } = options;

  const INVENTORY_BATCH_SOFT_TTL_MS = 15 * 60_000;
  const { runWhenBrowserIdle, scheduleDeferredTask } = useBrowserIdleTask();

  function shouldLoadInventorySummary(filters: any = currentFiltersForList()) {
    return Boolean(hasActiveInventoryBatch.value || String(filters.inventoryStatus || '').trim());
  }

  async function refreshInventoryBatch(options: { force?: boolean } = {}) {
    try {
      await refreshInventoryBatchStore({ silent: true, force: options.force, ttlMs: INVENTORY_BATCH_SOFT_TTL_MS });
      if (!inventoryBatch.value.active && inventoryStatus.value) {
        runWithoutAutoSearch(() => {
          inventoryStatus.value = '';
        });
      }
    } catch {
      inventoryBatch.value = {
        active: null,
        latest: inventoryBatch.value.latest || null,
        recent: inventoryBatch.value.recent || [],
      };
    }
  }

  async function refreshInventorySummary(filters: any = currentFiltersForList()) {
    if (!shouldLoadInventorySummary(filters)) {
      inventorySummary.value = { total: 0, normal: 0, profit: 0, loss: 0, pending: 0 } as any;
      return;
    }
    try {
      if (hasActiveInventoryBatch.value) {
        invalidateAssetInventorySummaryCache(assetType);
      }
      inventorySummary.value = await refreshSummaryFn(filters);
    } catch (error) {
      console.warn(`${assetType} inventory summary failed`, error);
    }
  }

  function scheduleDeferredInventoryBatchRefresh(task: () => void | Promise<void>) {
    scheduleDeferredTask(task, batchRefreshDelayMs, idleTimeout);
  }

  function scheduleAuxiliaryRefresh(initialFilters: any) {
    const snapshot = { ...initialFilters };
    const needSummary = shouldLoadInventorySummary(snapshot);
    runWhenBrowserIdle(async () => {
      if (needSummary) void refreshInventorySummary(snapshot);
    });
  }

  return {
    shouldLoadInventorySummary,
    refreshInventoryBatch,
    refreshInventorySummary,
    scheduleDeferredInventoryBatchRefresh,
    scheduleAuxiliaryRefresh,
  };
}
