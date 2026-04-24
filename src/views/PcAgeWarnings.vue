<template>
  <el-card class="ui-page-card">
    <div class="ui-toolbar ui-toolbar--ledger">
      <div class="ui-toolbar-main">
        <div class="ui-toolbar-block">
          <div class="ui-toolbar-title">
            筛选查询
          </div>
          <div class="ui-toolbar-row">
            <el-tag
              type="warning"
              class="ui-toolbar-tag"
            >
              报废预警：出厂时间超过 {{ ageYears }} 年
            </el-tag>

            <el-select
              v-model="status"
              placeholder="状态"
              clearable
              class="ui-toolbar-select"
              @change="onSearch"
            >
              <el-option label="在库" value="IN_STOCK" />
              <el-option label="已领用" value="ASSIGNED" />
              <el-option label="已回收" value="RECYCLED" />
            </el-select>

            <el-input
              v-model="keyword"
              clearable
              placeholder="关键词：序列号/品牌/型号/备注"
              class="ui-toolbar-input"
              @keyup.enter="onSearch"
            />

            <div class="ui-toolbar-actions">
              <el-button type="primary" @click="onSearch">查询</el-button>
              <el-button @click="reset">重置</el-button>
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
            <el-button
              type="danger"
              :loading="scrapLoading"
              :disabled="selectedIds.length===0"
              @click="createScrap()"
            >
              生成报废单（选中）
            </el-button>
            <el-button type="success" plain :loading="exporting" @click="exportExcel(false)">导出Excel（当前页）</el-button>
            <el-button type="success" :loading="exportingAll" @click="exportExcel(true)">导出Excel（全部）</el-button>
            <el-button type="info" plain @click="$router.push('/pc/assets')">返回台账</el-button>
          </div>
        </div>
      </div>
    </div>

    <LedgerTableSkeleton v-if="initialLoading && !rows.length" :row-count="Math.min(8, Math.max(6, Number(pageSize || 8)))" />

    <el-table
      v-else
      v-loading="refreshing"
      :data="rows"
      border
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="48" />
      <el-table-column label="序号" width="80" align="center">
        <template #default="{ $index }">
          {{ getRowNumber($index) }}
        </template>
      </el-table-column>
      <el-table-column label="电脑" min-width="260">
        <template #default="{row}">
          <div style="font-weight:600">{{ row.brand }} · {{ row.model }}</div>
          <div style="color:#999;font-size:12px">SN：{{ row.serial_no }}</div>
        </template>
      </el-table-column>
      <el-table-column label="出厂时间" width="140">
        <template #default="{row}">
          <span style="font-weight:600">{{ row.manufacture_date || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="机龄" width="110">
        <template #default="{row}">
          <el-tag type="danger" effect="dark">{{ calcAgeYears(row.manufacture_date) }} 年</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="保修" width="140">
        <template #default="{row}">
          <span>{{ row.warranty_end || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{row}">
          <el-tag v-if="row.status==='IN_STOCK'" type="success">在库</el-tag>
          <el-tag v-else-if="row.status==='ASSIGNED'" type="warning">已领用</el-tag>
          <el-tag v-else type="info">已回收</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="当前领用人" width="220">
        <template #default="{row}">
          <div v-if="row.status==='ASSIGNED'">
            <div style="font-weight:600">{{ row.last_employee_name || '-' }}</div>
            <div style="color:#999;font-size:12px">{{ row.last_employee_no || '-' }} · {{ row.last_department || '-' }}</div>
          </div>
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
        @current-change="handlePageChange"
        @size-change="handlePageSizeChange"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onBeforeMount, onBeforeUnmount, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from "../utils/el-services";
import { apiGet, apiPost } from '../api/client';
import { fetchSystemSettings, getCachedSystemSettings } from '../api/systemSettings';
import { exportToXlsx } from '../utils/excel';
import { usePagedAssetList } from '../composables/usePagedAssetList';
import { scheduleOnIdle } from '../utils/idle';
import LedgerTableSkeleton from '../components/assets/LedgerTableSkeleton.vue';

type WarningFilters = {
  ageYears: number;
  status: string;
  keyword: string;
};

const ageYears = ref(Number(getCachedSystemSettings().pc_scrap_warning_years || 5));
const status = ref<string>('');
const keyword = ref<string>('');
const exporting = ref(false);
const exportingAll = ref(false);
const selectedIds = ref<number[]>([]);
const scrapLoading = ref(false);

function currentFilters(): WarningFilters {
  return {
    ageYears: Number(ageYears.value || 5),
    status: String(status.value || '').trim(),
    keyword: String(keyword.value || '').trim(),
  };
}

const {
  rows,
  loading,
  refreshing,
  initialLoading,
  initialized,
  page,
  pageSize,
  total,
  reload,
  onPageChange,
  onPageSizeChange,
  clearTotalCache,
} = usePagedAssetList<WarningFilters, any>({
  initialPageSize: 50,
  totalDebounceMs: 250,
  createFilterKey: (filters) => `age_years=${filters.ageYears}&status=${filters.status}&keyword=${filters.keyword}`,
  fetchPage: async ({ filters, page, pageSize }) => {
    const qs = new URLSearchParams();
    qs.set('age_years', String(filters.ageYears));
    qs.set('page', String(page));
    qs.set('page_size', String(pageSize));
    if (filters.status) qs.set('status', filters.status);
    if (filters.keyword) qs.set('keyword', filters.keyword);
    qs.set('fast', '1');
    const result = await apiGet<{ data: any[]; total: number | null }>(`/api/pc-assets?${qs.toString()}`);
    return {
      rows: Array.isArray((result as any)?.data) ? (result as any).data : [],
      total: typeof (result as any)?.total === 'number' ? Number((result as any).total || 0) : null,
    };
  },
  fetchTotal: async (filters) => {
    const qs = new URLSearchParams();
    qs.set('age_years', String(filters.ageYears));
    if (filters.status) qs.set('status', filters.status);
    if (filters.keyword) qs.set('keyword', filters.keyword);
    const result = await apiGet<{ total: number }>(`/api/pc-assets-count?${qs.toString()}`);
    return Number((result as any)?.total || 0);
  },
});

function getRowNumber(index: number) {
  return (page.value - 1) * pageSize.value + index + 1;
}

function onSearch() {
  page.value = 1;
  void reload(currentFilters());
}

function reset() {
  status.value = '';
  keyword.value = '';
  page.value = 1;
  clearTotalCache();
  void reload(currentFilters());
}

function onSelectionChange(list: any[]) {
  selectedIds.value = (list || []).map((r: any) => Number(r.id)).filter((x) => Number.isFinite(x) && x > 0);
}

function handlePageChange(nextPage: number) {
  return onPageChange(currentFilters(), nextPage);
}

function handlePageSizeChange(nextSize: number) {
  return onPageSizeChange(currentFilters(), nextSize);
}

function calcAgeYears(dateStr: string) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  const now = new Date();
  let y = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) y -= 1;
  return y < 0 ? 0 : y;
}

function statusLabel(value: string) {
  if (value === 'IN_STOCK') return '在库';
  if (value === 'ASSIGNED') return '已领用';
  if (value === 'RECYCLED') return '已回收';
  if (value === 'SCRAPPED') return '已报废';
  return value || '-';
}

async function createScrap() {
  if (!selectedIds.value.length) return;

  let reason = '';
  try {
    const { value } = await ElMessageBox.prompt('请输入报废原因（可选）', '生成报废单', {
      confirmButtonText: '生成并导出',
      cancelButtonText: '取消',
      inputPlaceholder: '例如：超过使用年限 / 无法维修 / 配置过低等',
      inputType: 'textarea',
      inputValue: '',
    });
    reason = String(value || '').trim();
  } catch {
    return;
  }

  try {
    scrapLoading.value = true;
    const r = await apiPost<any>('/api/pc-scrap', { asset_ids: selectedIds.value, reason });
    const scrapNo = (r as any)?.scrap_no;
    if (!scrapNo) throw new Error('生成报废单失败');

    const detail = await apiGet<any>(`/api/pc-scrap?scrap_no=${encodeURIComponent(scrapNo)}`);
    const list = (detail as any)?.data || [];
    const data = list.map((x: any) => ({
      报废单号: x.scrap_no,
      报废日期: x.scrap_date,
      品牌: x.brand,
      型号: x.model,
      序列号: x.serial_no,
      出厂时间: x.manufacture_date,
      机龄: `${calcAgeYears(x.manufacture_date)} 年`,
      保修到期: x.warranty_end || '',
      硬盘: x.disk_capacity || '',
      内存: x.memory_size || '',
      备注: x.remark || '',
      报废原因: x.reason || '',
    }));

    exportToXlsx({
      filename: `电脑仓_报废单_${scrapNo}.xlsx`,
      headers: [
        { key: '报废单号', title: '报废单号' },
        { key: '报废日期', title: '报废日期' },
        { key: '品牌', title: '品牌' },
        { key: '型号', title: '型号' },
        { key: '序列号', title: '序列号' },
        { key: '出厂时间', title: '出厂时间' },
        { key: '机龄', title: '机龄' },
        { key: '保修到期', title: '保修到期' },
        { key: '硬盘', title: '硬盘' },
        { key: '内存', title: '内存' },
        { key: '备注', title: '备注' },
        { key: '报废原因', title: '报废原因' },
      ],
      rows: data,
      sheetName: '报废单',
    });

    ElMessage.success(`已报废并导出报废单：${scrapNo}`);
    selectedIds.value = [];
    clearTotalCache();
    await reload(currentFilters());
  } catch (e: any) {
    ElMessage.error(e?.message || '生成报废单失败');
  } finally {
    scrapLoading.value = false;
  }
}

let cancelSettingsSync: (() => void) | null = null;

async function syncAgeYearsFromSettings() {
  try {
    const settings = await fetchSystemSettings();
    const nextYears = Number(settings.pc_scrap_warning_years || ageYears.value || 5);
    if (nextYears === ageYears.value) return;
    ageYears.value = nextYears;
    page.value = 1;
    clearTotalCache();
    await reload(currentFilters(), { silent: true });
  } catch {
    // ignore and keep cached fallback
  }
}

async function exportExcel(all: boolean) {
  const loadingRef = all ? exportingAll : exporting;
  try {
    loadingRef.value = true;
    const filters = currentFilters();
    const rowsToExport = all ? await fetchAllWarningRows(filters) : rows.value;
    if (!rowsToExport.length) return ElMessage.warning('当前没有可导出的报废预警数据');
    exportToXlsx({
      filename: `电脑报废预警_${all ? '全部' : '当前页'}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`,
      sheetName: '报废预警',
      headers: [
        { key: 'brand', title: '品牌' },
        { key: 'model', title: '型号' },
        { key: 'serial_no', title: '序列号' },
        { key: 'manufacture_date', title: '出厂时间' },
        { key: 'age_years', title: '机龄(年)' },
        { key: 'warranty_end', title: '保修到期' },
        { key: 'status_text', title: '状态' },
        { key: 'last_employee_name', title: '当前领用人' },
        { key: 'last_employee_no', title: '工号' },
        { key: 'last_department', title: '部门' },
        { key: 'remark', title: '备注' },
      ],
      rows: rowsToExport.map((row: any) => ({
        brand: row.brand || '',
        model: row.model || '',
        serial_no: row.serial_no || '',
        manufacture_date: row.manufacture_date || '',
        age_years: calcAgeYears(row.manufacture_date),
        warranty_end: row.warranty_end || '',
        status_text: statusLabel(String(row.status || '')),
        last_employee_name: row.last_employee_name || '',
        last_employee_no: row.last_employee_no || '',
        last_department: row.last_department || '',
        remark: row.remark || '',
      })),
    });
    ElMessage.success(all ? `已导出筛选结果（${rowsToExport.length} 条）` : `已导出当前页（${rowsToExport.length} 条）`);
  } catch (e: any) {
    ElMessage.error(e?.message || '导出失败');
  } finally {
    loadingRef.value = false;
  }
}

async function fetchAllWarningRows(filters: WarningFilters) {
  const MAX_ROWS = 10000;
  const CHUNK = 200;
  const allRows: any[] = [];
  let currentPage = 1;

  while (allRows.length < MAX_ROWS) {
    const qs = new URLSearchParams();
    qs.set('age_years', String(filters.ageYears));
    qs.set('page', String(currentPage));
    qs.set('page_size', String(CHUNK));
    if (filters.status) qs.set('status', filters.status);
    if (filters.keyword) qs.set('keyword', filters.keyword);
    const result = await apiGet<{ data: any[] }>(`/api/pc-assets?${qs.toString()}`);
    const chunkRows = Array.isArray((result as any)?.data) ? (result as any).data : [];
    if (!chunkRows.length) break;
    const remain = MAX_ROWS - allRows.length;
    allRows.push(...chunkRows.slice(0, remain));
    if (chunkRows.length < CHUNK) break;
    currentPage += 1;
  }

  return allRows;
}

onMounted(async () => {
  page.value = 1;
  clearTotalCache();
  await reload(currentFilters());
  cancelSettingsSync = scheduleOnIdle(() => {
    void syncAgeYearsFromSettings();
  }, 1200);
});

onBeforeUnmount(() => {
  cancelSettingsSync?.();
  cancelSettingsSync = null;
});
</script>
