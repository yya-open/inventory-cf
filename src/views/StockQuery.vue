<template>
  <el-card>
    <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 12px; flex-wrap:wrap">
      <el-input
        v-model="keyword"
        placeholder="搜索：名称/SKU/品牌/型号"
        style="max-width: 360px"
        clearable
        @keyup.enter="onSearch"
      />

      <el-select
        v-model="sort"
        style="width: 160px"
        placeholder="排序"
        @change="onSearch"
      >
        <el-option label="预警优先" value="warning_first" />
        <el-option label="库存升序" value="qty_asc" />
        <el-option label="库存降序" value="qty_desc" />
        <el-option label="SKU 升序" value="sku_asc" />
        <el-option label="名称 升序" value="name_asc" />
      </el-select>

      <el-button type="primary" @click="onSearch">
        查询
      </el-button>
      <el-button @click="onReset">
        重置
      </el-button>
      <el-button :disabled="!rows.length || exportLoading" :loading="exportLoading" @click="doExport">
        导出Excel
      </el-button>
      <el-button
        type="warning"
        plain
        @click="$router.push('/warnings')"
      >
        查看预警
      </el-button>
    </div>

    <LedgerTableSkeleton v-if="initialLoading && !rows.length" :row-count="Math.min(8, Math.max(6, Number(pageSize || 8)))" />

    <LazyMountBlock v-else title="正在装载库存查询…" min-height="400px" :delay="0" :idle="false" :viewport="false">
      <el-table
        v-loading="refreshing"
        :data="rows"
        border
      >
        <el-table-column prop="sku" label="SKU" width="200" />
        <el-table-column prop="name" label="名称" min-width="220" />
        <el-table-column prop="brand" label="品牌" width="140" />
        <el-table-column prop="model" label="型号" width="160" />
        <el-table-column prop="category" label="分类" width="120" />
        <el-table-column prop="qty" label="库存" width="100">
          <template #default="{ row }">
            <span :style="{ color: row.is_warning ? '#d93026' : '', fontWeight: row.is_warning ? '700' : '' }">
              {{ row.qty }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="warning_qty" label="预警值" width="100" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.is_warning" type="danger">
              预警
            </el-tag>
            <el-tag v-else type="success">
              正常
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="快捷操作" width="220">
          <template #default="{ row }">
            <el-button size="small" @click="goIn(row.item_id)">
              入库
            </el-button>
            <el-button size="small" type="primary" plain @click="goOut(row.item_id)">
              出库
            </el-button>
            <el-button size="small" type="info" plain @click="goTx(row.item_id)">
              明细
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="display:flex; justify-content:flex-end; padding-top:12px">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100, 200]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="onPageChange"
          @size-change="onPageSizeChange"
        />
      </div>
    </LazyMountBlock>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeMount, onActivated } from "vue";
import { ElMessage } from "../utils/el-services";
import { apiGet } from "../api/client";
import { loadXlsx } from "../utils/excel";
import { beijingTodayYmd } from "../utils/datetime";
import { useRouter } from "vue-router";
import { useFixedWarehouseId } from "../utils/warehouse";
import LazyMountBlock from "../components/LazyMountBlock.vue";
import LedgerTableSkeleton from "../components/assets/LedgerTableSkeleton.vue";
import { usePagedAssetList } from "../composables/usePagedAssetList";

type StockFilters = {
  keyword: string;
  sort: string;
  warehouseId: number;
};

const router = useRouter();
const warehouseId = useFixedWarehouseId();

const keyword = ref("");
const sort = ref<string>("warning_first");
const exportLoading = ref(false);
const SOFT_REFRESH_TTL_MS = 20_000;
let lastRefreshAt = 0;

const currentFilters = computed<StockFilters>(() => ({
  keyword: keyword.value.trim(),
  sort: sort.value || "warning_first",
  warehouseId: Number(warehouseId.value || 1) || 1,
}));

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
} = usePagedAssetList<StockFilters, any>({
  initialPageSize: 50,
  totalDebounceMs: 650,
  cacheNamespace: "parts-stock",
  cacheTtlMs: 30_000,
  createFilterKey: (filters) => JSON.stringify(filters),
  fetchPage: async ({ filters, page: currentPage, pageSize: currentPageSize, fast, signal }) => {
    const qs = new URLSearchParams();
    qs.set("warehouse_id", String(filters.warehouseId));
    qs.set("sort", filters.sort || "warning_first");
    qs.set("page", String(currentPage));
    qs.set("page_size", String(currentPageSize));
    if (filters.keyword) qs.set("keyword", filters.keyword);
    if (fast) qs.set("fast", "1");
    const j = await apiGet<{ ok: boolean; data: any[]; total?: number }>(`/api/stock?${qs.toString()}`, { signal });
    return {
      rows: j.data || [],
      total: typeof (j as any).total === "number" ? Number((j as any).total || 0) : undefined,
    };
  },
  fetchTotal: async (filters, signal) => {
    const qs = new URLSearchParams();
    qs.set("warehouse_id", String(filters.warehouseId));
    qs.set("sort", filters.sort || "warning_first");
    if (filters.keyword) qs.set("keyword", filters.keyword);
    const j = await apiGet<{ ok: boolean; total: number }>(`/api/stock-count?${qs.toString()}`, { signal });
    return Number((j as any).total || 0);
  },
});

function goIn(item_id: number) {
  router.push({ path: "/in", query: { item_id: String(item_id) } });
}
function goOut(item_id: number) {
  router.push({ path: "/out", query: { item_id: String(item_id) } });
}
function goTx(item_id: number) {
  router.push({ path: "/tx", query: { item_id: String(item_id) } });
}

async function loadView(opts: { silent?: boolean; forceRefresh?: boolean } = {}) {
  await reload(currentFilters.value, opts);
  lastRefreshAt = Date.now();
}

function onSearch() {
  page.value = 1;
  void loadView({ forceRefresh: true });
}

function onReset() {
  keyword.value = "";
  sort.value = "warning_first";
  page.value = 1;
  void loadView({ forceRefresh: true });
}

function onPageChange(nextPage: number) {
  void baseOnPageChange(currentFilters.value, nextPage);
  lastRefreshAt = Date.now();
}

function onPageSizeChange(nextPageSize: number) {
  void baseOnPageSizeChange(currentFilters.value, nextPageSize);
  lastRefreshAt = Date.now();
}

async function doExport() {
  try {
    exportLoading.value = true;
    const header = ["SKU", "名称", "品牌", "型号", "分类", "库存", "预警值"];
    const aoa: any[][] = [header];
    for (const r of rows.value) {
      aoa.push([r.sku, r.name, r.brand || "", r.model || "", r.category || "", Number(r.qty), Number(r.warning_qty)]);
    }
    const XLSX = await loadXlsx();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "stock");
    XLSX.writeFile(wb, `stock_${warehouseId.value}_${beijingTodayYmd()}.xlsx`);
  } catch (e: any) {
    ElMessage.error(e?.message || "导出失败");
  } finally {
    exportLoading.value = false;
  }
}

onBeforeMount(() => {
  void loadView();
});

onActivated(() => {
  if (Date.now() - lastRefreshAt < SOFT_REFRESH_TTL_MS) return;
  void loadView({ silent: rows.value.length > 0, forceRefresh: true });
});
</script>
