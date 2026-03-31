<template>
  <div>
    <el-card
      shadow="never"
      class="ui-page-card mb12"
    >
      <div class="ui-toolbar ui-toolbar--ledger">
        <div class="ui-toolbar-main">
          <div class="ui-toolbar-block">
            <div class="ui-toolbar-title">
              筛选查询
            </div>
            <div class="ui-toolbar-row">
              <el-select
                v-model="q.type"
                placeholder="动作"
                clearable
                class="ui-toolbar-select"
                @change="reload()"
              >
                <el-option
                  label="入库"
                  value="IN"
                />
                <el-option
                  label="出库"
                  value="OUT"
                />
                <el-option
                  label="归还"
                  value="RETURN"
                />
                <el-option
                  label="调拨"
                  value="TRANSFER"
                />
                <el-option
                  label="报废"
                  value="SCRAP"
                />
                <el-option
                  label="调整"
                  value="ADJUST"
                />
              </el-select>

              <el-date-picker
                v-model="q.dates"
                type="daterange"
                unlink-panels
                range-separator="-"
                start-placeholder="开始"
                end-placeholder="结束"
                value-format="YYYY-MM-DD"
                class="ui-toolbar-date"
                @change="reload()"
              />

              <el-input
                v-model="q.keyword"
                placeholder="关键词：资产编号/SN/员工/备注"
                clearable
                class="ui-toolbar-input"
                @keyup.enter="reload()"
              />

              <div class="ui-toolbar-actions">
                <el-button
                  type="primary"
                  @click="reload()"
                >
                  查询
                </el-button>
              </div>

              <el-radio-group
                v-model="q.effective"
                size="small"
                class="ui-toolbar-toggle-group"
                @change="reload()"
              >
                <el-radio-button label="">全部记录</el-radio-button>
                <el-radio-button label="history">非当前生效</el-radio-button>
                <el-radio-button label="current">当前生效</el-radio-button>
              </el-radio-group>
            </div>
          </div>
        </div>

        <div class="ui-toolbar-side">
          <div class="ui-toolbar-block">
            <div class="ui-toolbar-title">
              快捷工具
            </div>
            <div class="ui-toolbar-tool-grid">
              <el-button @click="doExport">
                导出
              </el-button>
              <el-button
                v-if="can('admin')"
                type="danger"
                plain
                :disabled="!selected.length || actionLoading"
                @click="doDelete"
              >
                删除
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <el-card shadow="never">
      <LedgerTableSkeleton v-if="initialLoading && !rows.length" :row-count="Math.min(8, Math.max(6, Number(pageSize || 8)))" />
      <el-table
        v-else
        v-loading="refreshing || actionLoading"
        :data="rows"
        size="small"
        border
        @selection-change="onSel"
      >
        <el-table-column
          type="selection"
          width="44"
        />
        <el-table-column
          prop="created_at"
          label="时间"
          min-width="170"
        />
        <el-table-column
          label="动作"
          width="120"
        >
          <template #default="{ row }">
            <div>{{ typeText(row.tx_type) }}</div>
            <el-tag v-if="row.is_current_effective" type="success" effect="plain" size="small" style="margin-top:6px">当前生效</el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="asset_code"
          label="资产编号"
          min-width="160"
        />
        <el-table-column
          label="型号"
          min-width="200"
        >
          <template #default="{ row }">
            {{ [row.brand, row.model].filter(Boolean).join(' ') }}
          </template>
        </el-table-column>
        <el-table-column
          label="员工"
          min-width="200"
        >
          <template #default="{ row }">
            <span v-if="row.employee_no || row.employee_name">{{ row.employee_name }}（{{ row.employee_no }}）</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column
          prop="remark"
          label="备注"
          min-width="220"
        />
        <el-table-column
          prop="created_by"
          label="操作人"
          width="120"
        />
      </el-table>

      <div style="margin-top:12px; display:flex; justify-content:flex-end">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next"
          :total="total"
          :page-size="pageSize"
          :current-page="page"
          @update:page-size="onSize"
          @update:current-page="onPage"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onBeforeMount, onActivated, reactive, ref } from "vue";
import { usePagedAssetList } from "../composables/usePagedAssetList";
import LedgerTableSkeleton from "../components/assets/LedgerTableSkeleton.vue";
import { ElMessage, ElMessageBox } from "../utils/el-services";
import { apiDownload, apiGet, apiPost } from "../api/client";
import { can } from "../store/auth";

const q = reactive({ type: "", keyword: "", dates: [] as any[], effective: '' as '' | 'current' | 'history' });
const selected = ref<any[]>([]);
const actionLoading = ref(false);
const SOFT_REFRESH_TTL_MS = 20_000;
let lastRefreshAt = 0;

type MonitorTxFilters = {
  type: string;
  keyword: string;
  dateFrom: string;
  dateTo: string;
  effective: '' | 'current' | 'history';
};

function currentFilters(): MonitorTxFilters {
  return {
    type: String(q.type || "").trim().toUpperCase(),
    keyword: String(q.keyword || "").trim(),
    dateFrom: String(q.dates?.[0] || "").trim(),
    dateTo: String(q.dates?.[1] || "").trim(),
    effective: q.effective,
  };
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
} = usePagedAssetList<MonitorTxFilters, any>({
  cacheNamespace: "monitor-tx",
  cacheTtlMs: 60_000,
  totalDebounceMs: 350,
  createFilterKey: (filters) => JSON.stringify(filters),
  fetchPage: async ({ filters, page, pageSize, fast, signal }) => {
    const params = buildParams(filters, true, page, pageSize);
    if (fast) params.set("fast", "1");
    const r = await apiGet<any>(`/api/monitor-tx?${params.toString()}`, { signal });
    return {
      rows: Array.isArray(r?.data) ? r.data : [],
      total: typeof r?.total === 'number' ? Number(r.total || 0) : null,
    };
  },
  fetchTotal: async (filters, signal) => {
    const params = buildParams(filters, false);
    const j = await apiGet<any>(`/api/monitor-tx-count?${params.toString()}`, { signal });
    return Number(j?.data?.total || j?.total || 0);
  },
});

function typeText(v: any) {
  const x = String(v || "");
  if (x === "IN") return "入库";
  if (x === "OUT") return "出库";
  if (x === "RETURN") return "归还";
  if (x === "TRANSFER") return "调拨";
  if (x === "SCRAP") return "报废";
  if (x === "ADJUST") return "调整";
  return x || "-";
}


function buildParams(filters: MonitorTxFilters, withPage: boolean, pageNumber = page.value, size = pageSize.value) {
  const params = new URLSearchParams();
  if (withPage) {
    params.set("page", String(pageNumber));
    params.set("page_size", String(size));
  }
  if (filters.type) params.set("type", filters.type);
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.effective) params.set("effective", filters.effective);
  return params;
}

async function loadList(options: { keepPage?: boolean; silent?: boolean; forceRefresh?: boolean } = {}) {
  await loadPaged(currentFilters(), {
    keepPage: options.keepPage ?? true,
    silent: options.silent,
    forceRefresh: options.forceRefresh,
  });
  lastRefreshAt = Date.now();
}

function reload() {
  page.value = 1;
  void loadList();
}

function onPage(p: number) {
  page.value = p;
  void loadList({ keepPage: true });
}
function onSize(s: number) {
  pageSize.value = s;
  page.value = 1;
  void loadList({ keepPage: true });
}

function onSel(v: any[]) {
  selected.value = v || [];
}

async function doExport() {
  try {
    const p = buildParams(currentFilters(), false);
    const fn = `显示器出入库明细_${new Date().toISOString().slice(0, 10)}.csv`;
    await apiDownload(`/api/monitor-tx/export?${p.toString()}`, fn);
  } catch (e: any) {
    ElMessage.error(e.message || "导出失败");
  }
}

async function doDelete() {
  try {
    await ElMessageBox.confirm("删除后无法恢复，确认继续？需要输入二次确认。", "提示", { type: "warning" });
    const { value } = await ElMessageBox.prompt("请输入 删除 以确认", "二次确认", { inputPlaceholder: "删除" });
    actionLoading.value = true;
    await apiPost<any>(`/api/monitor-tx/delete`, { entries: selected.value.map((x) => ({ id: x.id })), confirm: value });
    ElMessage.success("删除成功");
    selected.value = [];
    invalidateCache();
    clearTotalCache();
    await loadList({ forceRefresh: true });
  } catch (e: any) {
    if (e?.message) ElMessage.error(e.message);
  } finally {
    actionLoading.value = false;
  }
}

onBeforeMount(() => {
  void loadList({ keepPage: true });
});

onActivated(() => {
  if (Date.now() - lastRefreshAt < SOFT_REFRESH_TTL_MS) return;
  void loadList({ keepPage: true, silent: true });
});
</script>

<style scoped>
.mb12 { margin-bottom: 12px; }
</style>
