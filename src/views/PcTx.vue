<template>
  <el-card class="ui-page-card">
    <div class="ui-toolbar ui-toolbar--ledger">
      <div class="ui-toolbar-main">
        <div class="ui-toolbar-block">
          <div class="ui-toolbar-title">
            筛选查询
          </div>
          <div class="ui-toolbar-row">
            <el-select
              v-model="type"
              placeholder="类型"
              clearable
              class="ui-toolbar-select"
              @change="onSearch"
            >
              <el-option
                label="入库(IN)"
                value="IN"
              />
              <el-option
                label="出库(OUT)"
                value="OUT"
              />
              <el-option
                label="归还(RETURN)"
                value="RETURN"
              />
              <el-option
                label="回收(RECYCLE)"
                value="RECYCLE"
              />
            </el-select>

            <el-date-picker
              v-model="dateRange"
              type="daterange"
              range-separator="到"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              value-format="YYYY-MM-DD"
              class="ui-toolbar-date"
            />

            <el-input
              v-model="keyword"
              clearable
              placeholder="关键词：单号/序列号/员工/部门/品牌/型号"
              class="ui-toolbar-input"
              @keyup.enter="onSearch"
            />

            <div class="ui-toolbar-actions">
              <el-button
                type="primary"
                @click="onSearch"
              >
                查询
              </el-button>
              <el-button @click="reset">
                重置
              </el-button>
            </div>
          </div>

          <div class="ui-toolbar-filter-bar">
            <span class="ui-toolbar-filter-label">生效状态</span>
            <div class="ui-toolbar-segmented" role="tablist" aria-label="生效状态筛选">
              <el-button
                class="ui-toolbar-segment"
                :class="{ 'is-active': effectiveFilter === '' }"
                :type="effectiveFilter === '' ? 'primary' : 'default'"
                plain
                @click="setEffectiveFilter('')"
              >
                全部记录
              </el-button>
              <el-button
                class="ui-toolbar-segment"
                :class="{ 'is-active': effectiveFilter === 'history' }"
                :type="effectiveFilter === 'history' ? 'primary' : 'default'"
                plain
                @click="setEffectiveFilter('history')"
              >
                非当前生效
              </el-button>
              <el-button
                class="ui-toolbar-segment"
                :class="{ 'is-active': effectiveFilter === 'current' }"
                :type="effectiveFilter === 'current' ? 'primary' : 'default'"
                plain
                @click="setEffectiveFilter('current')"
              >
                当前生效
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <div class="ui-toolbar-side">
        <div class="ui-toolbar-block">
          <div class="ui-toolbar-title">
            快捷工具
          </div>
          <div class="ui-toolbar-tool-grid">
            <el-button @click="exportExcel">
              导出Excel
            </el-button>
            <el-button
              type="info"
              plain
              @click="$router.push('/pc/assets')"
            >
              返回台账
            </el-button>
            <el-button
              v-if="isAdmin"
              type="danger"
              plain
              :disabled="selectedRows.length===0 || loading"
              @click="deleteSelected"
            >
              删除选中
            </el-button>
            <el-button
              v-if="isAdmin"
              type="danger"
              :disabled="loading"
              @click="clearPcTx"
            >
              清空记录
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <LazyMountBlock title="正在装载电脑明细…" min-height="420px" :delay="0" :idle="false" :viewport="false">
      <LedgerTableSkeleton v-if="initialLoading && !rows.length" :row-count="Math.min(8, Math.max(6, Number(pageSize || 8)))" />
      <el-table
        v-else
        v-loading="refreshing || actionLoading"
        :data="rows"
        border
        row-key="__rowKey"
        @selection-change="onSelectionChange"
      >
      <el-table-column
        v-if="isAdmin"
        type="selection"
        width="46"
      />
      <el-table-column
        label="时间"
        width="170"
      >
        <template #default="{row}">
          {{ formatBjTime(row.created_at, row) }}
        </template>
      </el-table-column>
      <el-table-column
        prop="type"
        label="类型"
        width="120"
      >
        <template #default="{row}">
          <el-tag
            v-if="row.type==='IN'"
            type="success"
          >
            入库
          </el-tag>
          <el-tag
            v-else-if="row.type==='OUT'"
            type="danger"
          >
            出库
          </el-tag>
          <el-tag
            v-else-if="row.type==='RETURN'"
            type="warning"
          >
            归还
          </el-tag>
          <el-tag
            v-else-if="row.type==='SCRAP'"
            type="danger"
          >
            报废
          </el-tag>
          <el-tag
            v-else
            type="info"
          >
            回收
          </el-tag>
          <div v-if="row.is_current_effective" style="margin-top:8px">
            <el-tag type="success" effect="plain" size="small">当前生效</el-tag>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="电脑"
        min-width="260"
      >
        <template #default="{row}">
          <div style="font-weight:600">
            {{ row.brand }} · {{ row.model }}
          </div>
          <div style="color:#999;font-size:12px">
            SN：{{ row.serial_no }}
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="员工"
        width="220"
      >
        <template #default="{row}">
          <div v-if="row.type!=='IN'">
            <div style="font-weight:600">
              {{ row.employee_name || "-" }}
            </div>
            <div style="color:#999;font-size:12px">
              {{ row.employee_no || "-" }} · {{ row.department || "-" }}
            </div>
          </div>
          <span v-else>-</span>
        </template>
      </el-table-column>

      <el-table-column
        prop="config_date"
        label="配置日期"
        width="130"
      />
      <el-table-column
        prop="recycle_date"
        label="回收/归还日期"
        width="130"
      />
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
import { ref, computed, onBeforeMount, onActivated } from "vue";
import { ElMessage, ElMessageBox } from "../utils/el-services";
import { exportToXlsx } from "../utils/excel";
import { apiGet, apiPost } from "../api/client";
import { withDestructiveActionFeedback } from '../utils/destructiveAction';
import { can, useAuth } from "../store/auth";
import { formatBeijingDateTime } from "../utils/datetime";
import { usePagedAssetList } from "../composables/usePagedAssetList";
import LazyMountBlock from "../components/LazyMountBlock.vue";
import LedgerTableSkeleton from "../components/assets/LedgerTableSkeleton.vue";

const canOperator = computed(() => can("operator"));
const auth = useAuth();
const isAdmin = computed(() => auth.user?.role === "admin");
const actionLoading = ref(false);
const selectedRows = ref<any[]>([]);
const type = ref<string>("");
const keyword = ref<string>("");
const dateRange = ref<[string, string] | null>(null);
const effectiveFilter = ref<'' | 'current' | 'history'>('');
const SOFT_REFRESH_TTL_MS = 20_000;
let lastRefreshAt = 0;

type PcTxFilters = {
  type: string;
  keyword: string;
  dateFrom: string;
  dateTo: string;
  effective: '' | 'current' | 'history';
};

function currentFilters(): PcTxFilters {
  return {
    type: String(type.value || "").trim().toUpperCase(),
    keyword: String(keyword.value || "").trim(),
    dateFrom: String(dateRange.value?.[0] || "").trim(),
    dateTo: String(dateRange.value?.[1] || "").trim(),
    effective: effectiveFilter.value,
  };
}

function filterKey(filters: PcTxFilters) {
  return `type=${filters.type}&keyword=${filters.keyword}&d0=${filters.dateFrom}&d1=${filters.dateTo}&effective=${filters.effective}`;
}

function buildListParams(filters: PcTxFilters, withPage: boolean, pageNumber = page.value, size = pageSize.value) {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.dateFrom) params.set("date_from", `${filters.dateFrom} 00:00:00`);
  if (filters.dateTo) params.set("date_to", `${filters.dateTo} 23:59:59`);
  if (filters.effective) params.set("effective", filters.effective);
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
} = usePagedAssetList<PcTxFilters, any>({
  cacheNamespace: "pc-tx",
  cacheTtlMs: 60_000,
  totalDebounceMs: 350,
  createFilterKey: filterKey,
  fetchPage: async ({ filters, page, pageSize, fast, signal }) => {
    const params = buildListParams(filters, true, page, pageSize);
    if (fast) params.set("fast", "1");
    const r: any = await apiGet(`/api/pc-tx?${params.toString()}`, { signal });
    return {
      rows: (r.data || []).map((it: any) => ({ ...it, __rowKey: `${String(it.type || "").toUpperCase()}_${it.id}` })),
      total: typeof r.total === "number" ? Number(r.total || 0) : null,
    };
  },
  fetchTotal: async (filters, signal) => {
    const params = buildListParams(filters, false);
    const r: any = await apiGet(`/api/pc-tx-count?${params.toString()}`, { signal });
    return Number(r.total || 0);
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
  void load();
}

function setEffectiveFilter(value: '' | 'current' | 'history') {
  if (effectiveFilter.value === value) return;
  effectiveFilter.value = value;
  onSearch();
}

function reset() {
  type.value = "";
  keyword.value = "";
  dateRange.value = null;
  effectiveFilter.value = '';
  page.value = 1;
  clearTotalCache();
  void load({ forceRefresh: true });
}

function formatBjTime(s?: string, row?: any) {
  const v = (row && (row.created_at_bj || row.time_bj)) || s;
  if (!v) return "-";
  try { return formatBeijingDateTime(v); } catch { return String(v); }
}

function onPageChange(nextPage: number) {
  page.value = nextPage;
  void load({ keepPage: true });
}
function onPageSizeChange(nextPageSize: number) {
  pageSize.value = nextPageSize;
  page.value = 1;
  void load({ keepPage: true });
}



async function fetchAll() {
  const all: any[] = [];
  let p = 1;
  let totalLocal = 0;
  do {
    const params = new URLSearchParams();
    if (type.value) params.set("type", type.value);
    if (keyword.value) params.set("keyword", keyword.value);
    if (dateRange.value?.[0]) params.set("date_from", `${dateRange.value[0]} 00:00:00`);
    if (dateRange.value?.[1]) params.set("date_to", `${dateRange.value[1]} 23:59:59`);
    if (effectiveFilter.value) params.set("effective", effectiveFilter.value);
    params.set("page", String(p));
    params.set("page_size", "200");
    const r: any = await apiGet(`/api/pc-tx?${params.toString()}`);
    const rows = r?.data || [];
    totalLocal = Number(r?.total || 0);
    all.push(...rows);
    p++;
    if (all.length >= totalLocal) break;
  } while (p < 999);
  return all;
}

async function exportExcel() {
  try {
    actionLoading.value = true;
    const all = (await fetchAll()).map((r: any) => ({
      ...r,
      created_at: formatBjTime(r.created_at),
    }));
    exportToXlsx({
      filename: "电脑出入库明细_仓库2.xlsx",
      sheetName: "明细",
      headers: [
        { key: "created_at", title: "时间" },
        { key: "tx_no", title: "单号" },
        { key: "type", title: "类型" },
        { key: "brand", title: "品牌" },
        { key: "serial_no", title: "序列号" },
        { key: "model", title: "型号" },
        { key: "employee_no", title: "员工工号" },
        { key: "department", title: "部门" },
        { key: "employee_name", title: "员工姓名" },
        { key: "is_employed", title: "是否在职" },
        { key: "config_date", title: "配置日期" },
        { key: "recycle_date", title: "回收/归还日期" },
        { key: "remark", title: "备注" },
      ],
      rows: all,
    });
  } catch (e: any) {
    ElMessage.error(e?.message || "导出失败");
  } finally {
    actionLoading.value = false;
  }
}

function onSelectionChange(list: any[]) {
  selectedRows.value = list || [];
}

function buildDeleteEntries(list: any[]) {
  return (list || []).map((r:any) => ({ id: Number(r.id), type: String(r.type || "").toUpperCase() }))
    .filter((e:any) => Number.isFinite(e.id) && e.id > 0 && e.type);
}

async function deleteSelected() {
  if (!isAdmin.value) return;
  const entries = buildDeleteEntries(selectedRows.value);
  if (!entries.length) return ElMessage.warning("请先勾选要删除的记录");
  try {
    await ElMessageBox.prompt(`请输入「删除」确认操作（将删除选中的 ${entries.length} 条记录）`, "删除确认", {
      confirmButtonText: "确认", cancelButtonText: "取消", inputPlaceholder: "删除",
      inputValidator: (v: string) => (String(v || "").trim() === "删除" ? true : "需要输入「删除」"),
    });
    actionLoading.value = true;
    const r:any = await withDestructiveActionFeedback("正在删除电脑出入库明细", () => apiPost("/api/pc-tx/delete", { entries, confirm: "删除" }));
    ElMessage.success(`已删除 ${Number(r?.data?.deleted || 0)} 条记录`);
    selectedRows.value = [];
    invalidateCache();
    clearTotalCache();
    await load({ forceRefresh: true });
  } catch (e:any) {
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e?.message || "删除失败");
  } finally { actionLoading.value = false; }
}

async function clearPcTx() {
  if (!isAdmin.value) return;
  try {
    const hasFilter = !!(type.value || keyword.value || dateRange.value?.[0] || dateRange.value?.[1] || effectiveFilter.value);
    const action = await ElMessageBox.confirm(
      hasFilter ? "将清空【当前筛选条件】下的电脑出入库明细记录。\n\n如果你要清空全部记录，请点『清空全部』。" : "当前没有筛选条件，将清空【全部】电脑出入库明细记录。\n\n此操作不可恢复，请谨慎！",
      "清空电脑出入库明细",
      { type: "warning", confirmButtonText: hasFilter ? "清空当前筛选" : "确认清空全部", cancelButtonText: hasFilter ? "清空全部" : "取消", distinguishCancelAndClose: true }
    ).then(() => (hasFilter ? "filtered" : "all"), (reason) => { if (reason === "cancel" && hasFilter) return "all"; return null; });
    if (!action) return;
    const expected = action === "all" ? "清空全部" : "清空";
    await ElMessageBox.prompt(`请输入「${expected}」确认操作（区分大小写）`, "二次确认", {
      confirmButtonText: "确认", cancelButtonText: "取消", inputPlaceholder: expected,
      inputValidator: (v: string) => (String(v || "").trim() === expected ? true : `需要输入「${expected}」`),
    });
    actionLoading.value = true;
    const all = await fetchAll();
    const entries = buildDeleteEntries(all);
    if (!entries.length) { ElMessage.warning("没有可清空的记录"); return; }
    let deleted = 0;
    for (let i = 0; i < entries.length; i += 200) {
      const chunk = entries.slice(i, i + 200);
      const r:any = await withDestructiveActionFeedback("正在批量清空电脑出入库明细", () => apiPost("/api/pc-tx/delete", { entries: chunk, confirm: "删除" }));
      deleted += Number(r?.data?.deleted || 0);
    }
    ElMessage.success(`已清空 ${deleted} 条记录`);
    selectedRows.value = [];
    invalidateCache();
    clearTotalCache();
    await load({ forceRefresh: true });
  } catch (e:any) {
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e?.message || "清空失败");
  } finally { actionLoading.value = false; }
}

onBeforeMount(() => {
  void load({ keepPage: true });
});

onActivated(() => {
  if (Date.now() - lastRefreshAt < SOFT_REFRESH_TTL_MS) return;
  void load({ keepPage: true, silent: true });
});
</script>
