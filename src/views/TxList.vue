<template>
  <el-card>
    <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px">
      <el-select
        v-model="type"
        placeholder="类型"
        clearable
        style="width:140px"
      >
        <el-option label="入库(IN)" value="IN" />
        <el-option label="出库(OUT)" value="OUT" />
        <el-option label="盘点调整(ADJUST)" value="ADJUST" />
        <el-option label="撤销盘点(REVERSAL)" value="REVERSAL" />
      </el-select>

      <el-select
        v-model="item_id"
        filterable
        clearable
        placeholder="配件（可搜索）"
        style="width:320px"
        :loading="itemsLoading"
        @visible-change="onItemSelectVisibleChange"
      >
        <el-option
          v-for="it in items"
          :key="it.id"
          :label="`${it.sku} · ${it.name}`"
          :value="it.id"
        />
      </el-select>

      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="到"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
      />

      <el-input
        v-model="keyword"
        clearable
        placeholder="关键词：SKU/名称/备注"
        style="width: 220px"
      />

      <el-select
        v-model="sortBy"
        placeholder="排序字段"
        style="width: 140px"
        @change="onSearch"
      >
        <el-option label="时间" value="created_at" />
        <el-option label="数量" value="qty" />
        <el-option label="SKU" value="sku" />
      </el-select>
      <el-select
        v-model="sortDir"
        placeholder="方向"
        style="width: 110px"
        @change="onSearch"
      >
        <el-option label="倒序" value="desc" />
        <el-option label="正序" value="asc" />
      </el-select>

      <el-button type="primary" @click="onSearch">
        查询
      </el-button>
      <el-button :disabled="!rows.length || exportLoading" :loading="exportLoading" @click="doExport">
        导出Excel
      </el-button>
      <el-button @click="reset">
        重置
      </el-button>
      <el-button
        type="success"
        plain
        :disabled="rows.length===0"
        @click="exportCsv"
      >
        导出CSV
      </el-button>

      <el-button
        v-if="isAdmin"
        type="danger"
        plain
        :disabled="loading || refreshing || clearLoading"
        :loading="clearLoading"
        @click="clearTx"
      >
        清空记录
      </el-button>
    </div>

    <LedgerTableSkeleton v-if="initialLoading && !rows.length" :row-count="Math.min(8, Math.max(6, Number(pageSize || 8)))" />

    <LazyMountBlock v-else title="正在装载配件明细…" min-height="400px" :delay="0" :idle="false" :viewport="false">
      <el-table
        v-loading="refreshing"
        :data="rows"
        border
      >
        <el-table-column label="时间" width="170">
          <template #default="{row}">
            {{ formatBeijingDateTime(row.created_at_bj || row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="120">
          <template #default="{row}">
            <el-tag
              :type="typeTagType(row.type)"
              effect="light"
              :title="row.type"
            >
              {{ typeLabel(row.type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="配件" min-width="260">
          <template #default="{row}">
            <div style="font-weight:600">
              {{ row.name }}
            </div>
            <div style="color:#999;font-size:12px">
              {{ row.sku }}
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="warehouse_name" label="仓库" width="120" />
        <el-table-column prop="qty" label="数量" width="90" />
        <el-table-column prop="delta_qty" label="变动" width="90">
          <template #default="{row}">
            <span v-if="typeof row.delta_qty === 'number'">{{ row.delta_qty > 0 ? '+' + row.delta_qty : row.delta_qty }}</span>
            <span v-else>{{ row.type==='IN' ? '+'+row.qty : row.type==='OUT' ? -row.qty : (row.delta_qty||0) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="来源/去向" width="200">
          <template #default="{row}">
            <span v-if="row.type==='IN'">{{ row.source || '-' }}</span>
            <span v-else-if="row.type==='OUT'">{{ row.target || '-' }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="220" show-overflow-tooltip />
      </el-table>

      <div style="display:flex; justify-content:flex-end; margin-top:12px">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          background
          layout="total, sizes, prev, pager, next, jumper"
          :page-sizes="[20, 50, 100, 200]"
          @current-change="onPageChange"
          @size-change="onPageSizeChange"
        />
      </div>
    </LazyMountBlock>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onBeforeMount, onActivated, computed } from "vue";
import { ElMessage, ElMessageBox } from "../utils/el-services";
import { apiDownload, apiGet, apiPost } from "../api/client";
import { useFixedWarehouseId } from "../utils/warehouse";
import { useRoute, useRouter } from "vue-router";
import { useAuth } from "../store/auth";
import { formatBeijingDateTime, beijingTodayYmd } from "../utils/datetime";
import LazyMountBlock from "../components/LazyMountBlock.vue";
import LedgerTableSkeleton from "../components/assets/LedgerTableSkeleton.vue";
import { usePagedAssetList } from "../composables/usePagedAssetList";

const TYPE_LABEL: Record<string, string> = {
  IN: "入库",
  OUT: "出库",
  ADJUST: "盘点调整",
  REVERSAL: "撤销盘点",
};
function typeLabel(t: string) {
  return TYPE_LABEL[t] || t;
}
function typeTagType(t: string) {
  if (t === "IN") return "success";
  if (t === "OUT") return "danger";
  if (t === "ADJUST") return "warning";
  if (t === "REVERSAL") return "info";
  return "info";
}

type TxFilters = {
  type: string;
  itemId: number | null;
  dateFrom: string;
  dateTo: string;
  keyword: string;
  sortBy: string;
  sortDir: string;
  warehouseId: number;
};

const route = useRoute();
const router = useRouter();
const warehouseId = useFixedWarehouseId();
const initialRouteItemId = Number(route.query.item_id || 0);

const items = ref<any[]>([]);
const itemsLoading = ref(false);
const itemsLoaded = ref(false);
const exportLoading = ref(false);
const clearLoading = ref(false);

const type = ref<string>("");
const item_id = ref<number | undefined>(Number.isFinite(initialRouteItemId) && initialRouteItemId > 0 ? initialRouteItemId : undefined);
const dateRange = ref<[string, string] | null>(null);
const keyword = ref("");
const sortBy = ref<string>("created_at");
const sortDir = ref<string>("desc");

const auth = useAuth();
const isAdmin = computed(() => auth.user?.role === "admin");
const SOFT_REFRESH_TTL_MS = 5_000;
const ITEMS_CACHE_TTL_MS = 10 * 60_000;
let lastRefreshAt = 0;
let itemsRequestPromise: Promise<void> | null = null;
let itemsController: AbortController | null = null;

function getItemsCacheKey() {
  return `inventory:tx-items:${Number(warehouseId.value || 1) || 1}`;
}

function readItemsCache() {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(getItemsCacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { rows: any[]; timestamp: number };
    if (!Array.isArray(parsed?.rows)) return null;
    if (Date.now() - Number(parsed?.timestamp || 0) > ITEMS_CACHE_TTL_MS) return null;
    return parsed.rows;
  } catch {
    return null;
  }
}

function persistItemsCache(list: any[]) {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(getItemsCacheKey(), JSON.stringify({ rows: list || [], timestamp: Date.now() }));
  } catch {
    // ignore
  }
}

function currentFilters(): TxFilters {
  return {
    type: String(type.value || "").trim(),
    itemId: item_id.value ? Number(item_id.value) : null,
    dateFrom: String(dateRange.value?.[0] || "").trim(),
    dateTo: String(dateRange.value?.[1] || "").trim(),
    keyword: String(keyword.value || "").trim(),
    sortBy: String(sortBy.value || "created_at").trim(),
    sortDir: String(sortDir.value || "desc").trim(),
    warehouseId: Number(warehouseId.value || 1) || 1,
  };
}

function createFilterKey(filters: TxFilters) {
  return [
    `type=${filters.type}`,
    `item=${filters.itemId || ''}`,
    `d0=${filters.dateFrom}`,
    `d1=${filters.dateTo}`,
    `keyword=${filters.keyword}`,
    `sort=${filters.sortBy}`,
    `dir=${filters.sortDir}`,
    `wh=${filters.warehouseId}`,
  ].join('&');
}

function buildListParams(filters: TxFilters, withPage: boolean, pageNumber = page.value, size = pageSize.value) {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.itemId) params.set("item_id", String(filters.itemId));
  if (filters.dateFrom) params.set("date_from", `${filters.dateFrom} 00:00:00`);
  if (filters.dateTo) params.set("date_to", `${filters.dateTo} 23:59:59`);
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.sortBy) params.set("sort_by", filters.sortBy);
  if (filters.sortDir) params.set("sort_dir", filters.sortDir);
  params.set("warehouse_id", String(filters.warehouseId || 1));
  if (withPage) {
    params.set("page", String(pageNumber));
    params.set("page_size", String(size));
  }
  return params;
}

const {
  rows,
  loading,
  refreshing,
  initialLoading,
  page,
  pageSize,
  total,
  load: loadPaged,
  clearTotalCache,
  invalidateCache,
} = usePagedAssetList<TxFilters, any>({
  cacheNamespace: "stock-tx",
  cacheTtlMs: 60_000,
  totalDebounceMs: 350,
  createFilterKey,
  fetchPage: async ({ filters, page, pageSize, fast, signal }) => {
    const params = buildListParams(filters, true, page, pageSize);
    if (fast) params.set("fast", "1");
    const j = await apiGet<any>(`/api/tx?${params.toString()}`, { signal });
    return {
      rows: Array.isArray(j?.data) ? j.data : [],
      total: typeof j?.total === "number" ? Number(j.total || 0) : null,
    };
  },
  fetchTotal: async (filters, signal) => {
    const params = buildListParams(filters, false);
    const j = await apiGet<any>(`/api/tx-count?${params.toString()}`, { signal });
    return Number(j?.total || 0);
  },
});

async function load(options: { keepPage?: boolean; silent?: boolean; forceRefresh?: boolean } = {}) {
  await loadPaged(currentFilters(), {
    keepPage: options.keepPage ?? true,
    silent: options.silent,
    forceRefresh: options.forceRefresh,
  });
  lastRefreshAt = Date.now();
}

function onSearch() {
  page.value = 1;
  invalidateCache();
  clearTotalCache();
  void load({ keepPage: false, forceRefresh: true });
}

function reset() {
  type.value = "";
  item_id.value = undefined;
  dateRange.value = null;
  keyword.value = "";
  sortBy.value = "created_at";
  sortDir.value = "desc";
  page.value = 1;
  invalidateCache();
  clearTotalCache();
  void load({ keepPage: false, forceRefresh: true });
}

function signedDelta(r: any) {
  if (typeof r?.delta_qty === "number") return r.delta_qty;
  if (r?.type === "IN") return Number(r.qty) || 0;
  if (r?.type === "OUT") return -(Number(r.qty) || 0);
  return 0;
}

function toCsvCell(v: any) {
  const s = String(v ?? "");
  const escaped = s.replace(/"/g, '""');
  return `"${escaped}"`;
}

async function doExport() {
  try {
    exportLoading.value = true;
    const params = buildListParams(currentFilters(), false);
    params.set("max", "50000");
    await apiDownload(`/api/tx/export?${params.toString()}`, `stock_tx_${beijingTodayYmd()}.csv`);
    ElMessage.success("已开始下载导出文件");
  } catch (e: any) {
    ElMessage.error(e?.message || "导出失败");
  } finally {
    exportLoading.value = false;
  }
}

function exportCsv() {
  const headers = ["时间","类型","SKU","名称","仓库","数量","变动","来源","去向","备注"];
  const lines = [headers.map(toCsvCell).join(",")];
  for (const r of rows.value) {
    lines.push([
      formatBeijingDateTime(r.created_at_bj || r.created_at), r.type, r.sku, r.name, r.warehouse_name, r.qty,
      signedDelta(r),
      r.source || "", r.target || "", r.remark || ""
    ].map(toCsvCell).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stock_tx_${beijingTodayYmd()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function loadItems(force = false) {
  if (!force) {
    if (items.value.length) return;
    const cached = readItemsCache();
    if (cached?.length) {
      items.value = cached;
      itemsLoaded.value = true;
      return;
    }
  }
  if (!force && itemsRequestPromise) return itemsRequestPromise;
  itemsController?.abort();
  const controller = new AbortController();
  itemsController = controller;
  let request: Promise<void> | null = null;
  request = (async () => {
    try {
      itemsLoading.value = true;
      const j = await apiGet<{ ok: boolean; data: any[] }>(`/api/items?page=1&page_size=200`, { signal: controller.signal });
      items.value = Array.isArray(j.data) ? j.data : [];
      itemsLoaded.value = true;
      persistItemsCache(items.value);
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      throw error;
    } finally {
      itemsLoading.value = false;
      if (request && itemsRequestPromise === request) itemsRequestPromise = null;
    }
  })();
  itemsRequestPromise = request;
  return request;
}

function onItemSelectVisibleChange(visible: boolean) {
  if (!visible || itemsLoaded.value || itemsLoading.value) return;
  void loadItems();
}

function onPageChange(nextPage: number) {
  page.value = nextPage;
  void load({ keepPage: true });
}

function onPageSizeChange(nextPageSize: number) {
  pageSize.value = nextPageSize;
  page.value = 1;
  void load({ keepPage: true, forceRefresh: true });
}

async function clearTx() {
  try {
    const filters = currentFilters();
    const params = buildListParams(filters, false);
    const hasFilter = [...params.keys()].some((key) => key !== 'warehouse_id');

    const action = await ElMessageBox.confirm(
      hasFilter
        ? "将清空【当前筛选条件】下的出入库明细记录。\n\n如果你要清空全部记录，请点『清空全部』。"
        : "当前没有筛选条件，将清空【全部】出入库明细记录。\n\n此操作不可恢复，请谨慎！",
      "清空出入库明细",
      {
        type: "warning",
        confirmButtonText: hasFilter ? "清空当前筛选" : "确认清空全部",
        cancelButtonText: hasFilter ? "清空全部" : "取消",
        distinguishCancelAndClose: true,
      }
    ).then(
      () => (hasFilter ? "filtered" : "all"),
      (reason) => {
        if (reason === "cancel" && hasFilter) return "all";
        return null;
      }
    );

    if (!action) return;

    const expected = action === "all" ? "清空全部" : "清空";
    let confirmText = "";
    try {
      const { value } = await ElMessageBox.prompt(
        `请输入「${expected}」确认操作（区分大小写）`,
        "二次确认",
        {
          confirmButtonText: "确认",
          cancelButtonText: "取消",
          inputPlaceholder: expected,
          inputValidator: (v: string) => (String(v || "").trim() === expected ? true : `需要输入「${expected}」`),
        }
      );
      confirmText = value;
    } catch {
      return;
    }

    clearLoading.value = true;
    const body: any = { mode: action, confirm: confirmText };
    if (action === "filtered") {
      if (filters.type) body.type = filters.type;
      if (filters.itemId) body.item_id = filters.itemId;
      if (filters.dateFrom) body.date_from = `${filters.dateFrom} 00:00:00`;
      if (filters.dateTo) body.date_to = `${filters.dateTo} 23:59:59`;
    }

    const r = await apiPost<{ ok: boolean; data: { deleted: number } }>("/api/tx/clear", body);
    ElMessage.success(`已清空 ${r.data.deleted} 条记录`);
    invalidateCache();
    clearTotalCache();
    await load({ keepPage: false, forceRefresh: true });
  } catch (e: any) {
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e?.message || "清空失败");
  } finally {
    clearLoading.value = false;
  }
}

function clearForceRefreshQuery() {
  const query = { ...route.query } as Record<string, any>;
  let changed = false;
  if (Object.prototype.hasOwnProperty.call(query, 'force_refresh')) {
    delete query.force_refresh;
    changed = true;
  }
  if (Object.prototype.hasOwnProperty.call(query, 'force_refresh_tx')) {
    delete query.force_refresh_tx;
    changed = true;
  }
  if (!changed) return;
  void router.replace({ path: route.path, query });
}

onBeforeMount(() => {
  if (route.query.force_refresh === '1' || route.query.force_refresh_tx === '1') {
    invalidateCache();
    clearTotalCache();
    clearForceRefreshQuery();
  }
  const tasks: Promise<unknown>[] = [load({ keepPage: false })];
  if (item_id.value) tasks.push(loadItems());
  void Promise.allSettled(tasks);
});

onActivated(() => {
  if (route.query.force_refresh === '1' || route.query.force_refresh_tx === '1') {
    invalidateCache();
    clearTotalCache();
    clearForceRefreshQuery();
    void load({ keepPage: true, forceRefresh: true });
    return;
  }
  if (Date.now() - lastRefreshAt < SOFT_REFRESH_TTL_MS) return;
  void load({ keepPage: true, silent: rows.value.length > 0, forceRefresh: true });
});
</script>
