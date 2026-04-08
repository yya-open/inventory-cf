<template>
  <el-card>
    <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin-bottom:12px">
      <el-select
        v-model="filters.category"
        clearable
        style="width:180px"
        placeholder="分类"
        @change="onSearch"
      >
        <el-option
          v-for="c in categories"
          :key="c"
          :label="c"
          :value="c"
        />
      </el-select>

      <el-input
        v-model="filters.keyword"
        style="width:240px"
        clearable
        placeholder="搜索：名称/SKU/品牌/型号"
        @keyup.enter="onSearch"
      />

      <el-switch
        v-model="filters.only_alert"
        active-text="只看异常"
        inactive-text="显示全部"
        @change="onSearch"
      />

      <el-select
        v-model="filters.sort"
        style="width:200px"
        @change="onSearch"
      >
        <el-option label="缺口从大到小" value="gap_desc" />
        <el-option label="缺口从小到大" value="gap_asc" />
        <el-option label="库存从小到大" value="qty_asc" />
        <el-option label="SKU A→Z" value="sku_asc" />
        <el-option label="名称 A→Z" value="name_asc" />
      </el-select>

      <el-button type="primary" @click="onSearch">
        查询
      </el-button>
      <el-button @click="reset">
        重置
      </el-button>

      <el-button type="warning" plain :loading="exportingCsv" @click="exportCsv">
        导出 CSV
      </el-button>
      <el-button type="success" plain :loading="exportingXlsx" @click="exportXlsx">
        导出 Excel
      </el-button>

      <div style="margin-left:auto; display:flex; gap:8px; align-items:center">
        <el-tag v-if="total" type="danger">
          {{ filters.only_alert ? "预警" : "列表" }}：{{ total }} 条
        </el-tag>
        <el-button size="small" type="info" plain @click="$router.push('/stock')">
          去库存查询
        </el-button>
      </div>
    </div>

    <div v-if="selectedIds.length" style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:10px">
      <el-tag type="info">
        已选 {{ selectedIds.length }} 条
      </el-tag>

      <el-select v-model="bulkMode" style="width:220px">
        <el-option label="统一设置预警值" value="set" />
        <el-option label="在原预警值基础上 +X" value="add" />
        <el-option label="设置为当前库存 +X" value="qty_plus" />
      </el-select>

      <el-input-number
        v-if="bulkMode === 'set'"
        v-model="bulkWarningQty"
        :min="0"
        :step="1"
        controls-position="right"
      />
      <el-input-number
        v-else
        v-model="bulkDelta"
        :min="bulkMode === 'add' ? -999999 : 0"
        :step="1"
        controls-position="right"
      />

      <el-button-group v-if="bulkMode !== 'set'">
        <el-button size="small" @click="bulkDelta += 1">+1</el-button>
        <el-button size="small" @click="bulkDelta += 5">+5</el-button>
        <el-button size="small" @click="bulkDelta += 10">+10</el-button>
      </el-button-group>

      <el-button type="primary" :loading="bulkSaving" @click="applyBulkWarning">
        应用到已选
      </el-button>
      <el-button @click="clearSelection">
        清空选择
      </el-button>
      <div style="color:#909399">
        （批量设置预警值仅管理员可用）
      </div>
    </div>

    <LedgerTableSkeleton v-if="initialLoading && !rows.length" :row-count="Math.min(8, Math.max(6, Number(pageSize || 8)))" />

    <LazyMountBlock v-else title="正在装载预警中心…" min-height="420px" :delay="0" :idle="false" :viewport="false">
      <el-table
        ref="tableRef"
        v-loading="refreshing"
        :data="rows"
        stripe
        row-key="item_id"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="46" />
        <el-table-column prop="sku" label="SKU" width="160" />
        <el-table-column prop="name" label="名称" min-width="180" />
        <el-table-column prop="brand" label="品牌" width="120" />
        <el-table-column prop="model" label="型号" width="140" />
        <el-table-column prop="category" label="分类" width="120" />
        <el-table-column prop="qty" label="库存" width="90">
          <template #default="{ row }">
            <span :style="{ color: row.qty <= row.warning_qty ? '#d93025' : '#1f883d', fontWeight: '600' }">
              {{ row.qty }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="warning_qty" label="预警值" width="90" />
        <el-table-column prop="gap" label="缺口" width="90">
          <template #default="{ row }">
            <span :style="{ color: row.gap >= 0 ? '#d93025' : '#606266', fontWeight: '600' }">
              {{ row.gap }}
            </span>
          </template>
        </el-table-column>

        <el-table-column prop="last_tx_at" label="最后变动" width="170">
          <template #default="{ row }">
            <span style="color:#606266">{{ formatTime(row.last_tx_at) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" plain @click="goIn(row.item_id)">
              入库
            </el-button>
            <el-button size="small" type="info" plain @click="goTx(row.item_id)">
              看明细
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="total" style="display:flex; justify-content:flex-end; margin-top:12px">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          :page-size="pageSize"
          :current-page="page"
          :page-sizes="[20, 50, 100, 200]"
          @current-change="onPageChange"
          @size-change="onPageSizeChange"
        />
      </div>

      <el-empty v-if="!refreshing && !loading && rows.length===0" description="暂无数据" />
    </LazyMountBlock>
  </el-card>
</template>

<script setup lang="ts">
import { ref, reactive, onBeforeMount, onActivated, computed } from "vue";
import { ElMessage } from "../utils/el-services";
import { apiDownload, apiGet, apiPost } from "../api/client";
import { useFixedWarehouseId } from "../utils/warehouse";
import { useRouter } from "vue-router";
import { loadXlsx } from "../utils/excel";
import { formatBeijingDateTime, beijingTodayCompact } from "../utils/datetime";
import LedgerTableSkeleton from "../components/assets/LedgerTableSkeleton.vue";
import LazyMountBlock from "../components/LazyMountBlock.vue";
import { usePagedAssetList } from "../composables/usePagedAssetList";

type WarningRow = {
  item_id: number;
  sku: string;
  name: string;
  brand?: string;
  model?: string;
  category?: string;
  qty: number;
  warning_qty: number;
  gap: number;
  last_tx_at?: string;
};

type WarningFilters = {
  category: string;
  keyword: string;
  only_alert: boolean;
  sort: string;
  warehouseId: number;
};

const META_CACHE_TTL_MS = 10 * 60_000;
const router = useRouter();
const warehouseId = useFixedWarehouseId();

const tableRef = ref<any>(null);
const categories = ref<string[]>([]);
const exportingCsv = ref(false);
const exportingXlsx = ref(false);
const SOFT_REFRESH_TTL_MS = 30_000;
let lastRefreshAt = 0;
let metaRequestPromise: Promise<void> | null = null;
let metaController: AbortController | null = null;

const filters = reactive<{ category: string; keyword: string; only_alert: boolean; sort: string }>({
  category: "",
  keyword: "",
  only_alert: true,
  sort: "gap_desc",
});

const currentFilters = computed<WarningFilters>(() => ({
  category: filters.category,
  keyword: filters.keyword.trim(),
  only_alert: filters.only_alert,
  sort: filters.sort || "gap_desc",
  warehouseId: Number(warehouseId.value || 1) || 1,
}));

const selected = ref<any[]>([]);
const selectedIds = computed(() => selected.value.map((r) => Number(r.item_id)).filter((n) => Number.isFinite(n)));
const bulkWarningQty = ref<number>(0);
const bulkDelta = ref<number>(5);
const bulkMode = ref<"set" | "add" | "qty_plus">("set");
const bulkSaving = ref(false);

const warehouseName = computed(() => {
  const id = Number(warehouseId.value || 1);
  return id === 2 ? "电脑仓" : "配件仓";
});

const {
  rows,
  loading,
  refreshing,
  initialLoading,
  page,
  pageSize,
  total,
  reload,
  onPageChange: baseOnPageChange,
  onPageSizeChange: baseOnPageSizeChange,
  invalidateCache,
} = usePagedAssetList<WarningFilters, WarningRow>({
  initialPageSize: 50,
  totalDebounceMs: 700,
  cacheNamespace: "parts-warnings",
  cacheTtlMs: 30_000,
  createFilterKey: (value) => JSON.stringify(value),
  fetchPage: async ({ filters: value, page: currentPage, pageSize: currentPageSize, fast, signal }) => {
    const qs = new URLSearchParams();
    qs.set("warehouse_id", String(value.warehouseId));
    qs.set("only_alert", value.only_alert ? "1" : "0");
    qs.set("sort", value.sort || "gap_desc");
    qs.set("page", String(currentPage));
    qs.set("page_size", String(currentPageSize));
    if (value.category) qs.set("category", value.category);
    if (value.keyword) qs.set("keyword", value.keyword);
    if (fast) qs.set("fast", "1");
    const j = await apiGet<{ ok: boolean; data: WarningRow[]; total?: number }>(`/api/warnings?${qs.toString()}`, { signal });
    return {
      rows: (j.data || []).map((row: any) => ({
        ...row,
        qty: Number(row.qty ?? 0),
        warning_qty: Number(row.warning_qty ?? 0),
        gap: Number(row.gap ?? (Number(row.warning_qty ?? 0) - Number(row.qty ?? 0))),
        last_tx_at: row.last_tx_at ?? "",
      })),
      total: typeof (j as any).total === "number" ? Number((j as any).total || 0) : undefined,
    };
  },
  fetchTotal: async (value, signal) => {
    const qs = new URLSearchParams();
    qs.set("warehouse_id", String(value.warehouseId));
    qs.set("only_alert", value.only_alert ? "1" : "0");
    qs.set("sort", value.sort || "gap_desc");
    if (value.category) qs.set("category", value.category);
    if (value.keyword) qs.set("keyword", value.keyword);
    const j = await apiGet<{ ok: boolean; total: number }>(`/api/warnings-count?${qs.toString()}`, { signal });
    return Number((j as any).total || 0);
  },
});

function getMetaCacheKey() {
  return `inventory:warnings-meta:${Number(warehouseId.value || 1) || 1}`;
}

function readMetaCache() {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(getMetaCacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { rows: string[]; timestamp: number };
    if (!Array.isArray(parsed?.rows)) return null;
    if (Date.now() - Number(parsed?.timestamp || 0) > META_CACHE_TTL_MS) return null;
    return parsed.rows;
  } catch {
    return null;
  }
}

function persistMetaCache(list: string[]) {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(getMetaCacheKey(), JSON.stringify({ rows: list || [], timestamp: Date.now() }));
  } catch {
    // ignore
  }
}

function goIn(item_id: number) {
  router.push({ path: "/in", query: { item_id: String(item_id) } });
}
function goTx(item_id: number) {
  router.push({ path: "/tx", query: { item_id: String(item_id) } });
}

function onSelectionChange(list: any[]) {
  selected.value = list || [];
}

function clearSelection() {
  selected.value = [];
  tableRef.value?.clearSelection?.();
}

async function applyBulkWarning() {
  if (!selectedIds.value.length) return;
  try {
    bulkSaving.value = true;
    const payload: any = { item_ids: selectedIds.value, mode: bulkMode.value };
    if (bulkMode.value === "set") {
      payload.warning_qty = Number(bulkWarningQty.value || 0);
    } else {
      payload.delta = Number(bulkDelta.value || 0);
      payload.warehouse_id = Number(warehouseId.value || 1);
    }
    await apiPost<{ ok: boolean; updated: number }>(`/api/items/bulk-warning`, payload);
    ElMessage.success("已更新预警值");
    clearSelection();
    invalidateCache(currentFilters.value);
    await loadView({ forceRefresh: true });
  } catch (e: any) {
    ElMessage.error(e?.message || "批量更新失败");
  } finally {
    bulkSaving.value = false;
  }
}

async function loadView(opts: { silent?: boolean; forceRefresh?: boolean } = {}) {
  await reload(currentFilters.value, opts);
  lastRefreshAt = Date.now();
}

function onPageChange(nextPage: number) {
  void baseOnPageChange(currentFilters.value, nextPage);
  lastRefreshAt = Date.now();
}

function onPageSizeChange(nextPageSize: number) {
  void baseOnPageSizeChange(currentFilters.value, nextPageSize);
  lastRefreshAt = Date.now();
}

async function loadMeta(force = false) {
  if (!force) {
    if (categories.value.length) return;
    const cached = readMetaCache();
    if (cached?.length) {
      categories.value = cached;
      return;
    }
  }
  if (!force && metaRequestPromise) return metaRequestPromise;
  metaController?.abort();
  const controller = new AbortController();
  metaController = controller;
  let request: Promise<void> | null = null;
  request = (async () => {
    try {
      const c = await apiGet<{ ok: boolean; data: string[] }>(`/api/meta/categories`, { signal: controller.signal });
      categories.value = c.data || [];
      persistMetaCache(categories.value);
    } catch (error: any) {
      if (error?.name === "AbortError") return;
      categories.value = [];
    } finally {
      if (request && metaRequestPromise === request) metaRequestPromise = null;
    }
  })();
  metaRequestPromise = request;
  return request;
}

function formatTime(v: any) {
  if (!v) return "-";
  try {
    return formatBeijingDateTime(v);
  } catch {
    return String(v);
  }
}

function onSearch() {
  page.value = 1;
  clearSelection();
  void loadView({ forceRefresh: true });
}

function reset() {
  filters.category = "";
  filters.keyword = "";
  filters.only_alert = true;
  filters.sort = "gap_desc";
  page.value = 1;
  clearSelection();
  invalidateCache();
  void loadView({ forceRefresh: true });
}

async function exportCsv() {
  try {
    exportingCsv.value = true;
    const qs = new URLSearchParams();
    qs.set("warehouse_id", String(warehouseId.value || 1));
    qs.set("only_alert", filters.only_alert ? "1" : "0");
    qs.set("sort", filters.sort || "gap_desc");
    if (filters.category) qs.set("category", filters.category);
    if (filters.keyword.trim()) qs.set("keyword", filters.keyword.trim());

    await apiDownload(`/api/warnings/export?${qs.toString()}`, "warnings.csv");
    ElMessage.success("已导出 CSV");
  } catch (e: any) {
    ElMessage.error(e?.message || "导出失败");
  } finally {
    exportingCsv.value = false;
  }
}

async function exportXlsx() {
  try {
    exportingXlsx.value = true;

    const data = rows.value.map((r) => ({
      仓库: warehouseName.value,
      SKU: r.sku,
      名称: r.name,
      品牌: r.brand,
      型号: r.model,
      分类: r.category,
      库存: r.qty,
      预警值: r.warning_qty,
      缺口: r.gap,
      最后变动: formatTime(r.last_tx_at),
    }));

    const XLSX = await loadXlsx();
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "预警中心");

    const filename = `warnings_${beijingTodayCompact()}.xlsx`;

    XLSX.writeFile(wb, filename);
    ElMessage.success("已导出 Excel");
  } catch (e: any) {
    ElMessage.error((e as any)?.message || "导出失败");
  } finally {
    exportingXlsx.value = false;
  }
}

onBeforeMount(() => {
  void Promise.allSettled([
    loadView(),
    loadMeta(),
  ]);
});

onActivated(() => {
  if (Date.now() - lastRefreshAt < SOFT_REFRESH_TTL_MS) return;
  void Promise.allSettled([
    loadView({ silent: rows.value.length > 0, forceRefresh: true }),
    categories.value.length ? Promise.resolve() : loadMeta(),
  ]);
});
</script>
