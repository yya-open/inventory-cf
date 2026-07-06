<template>
  <div class="ui-page-shell sku-governance-page">
    <div class="ui-page-heading">
      <div>
        <div class="ui-page-heading__kicker">系统管理</div>
        <h1>SKU 治理</h1>
        <div class="ui-page-heading__desc">扫描配件物料中不规范或旧格式 SKU，生成映射建议，确认后批量应用。</div>
      </div>
      <div class="page-actions">
        <el-select v-model="severity" style="width: 150px" @change="load">
          <el-option label="全部问题" value="all" />
          <el-option label="风险 SKU" value="risk" />
          <el-option label="旧格式 SKU" value="legacy" />
        </el-select>
        <el-button :loading="loading" @click="load">扫描</el-button>
        <el-button :disabled="!rows.length" @click="downloadCsv(rows)">下载映射表</el-button>
        <el-button :disabled="!selectedRows.length" @click="downloadCsv(selectedRows)">下载已选</el-button>
        <el-button type="primary" :loading="applying" :disabled="!selectedRows.length" @click="applySelected">
          应用已选 {{ selectedRows.length || '' }}
        </el-button>
      </div>
    </div>

    <el-row :gutter="12" class="summary-row">
      <el-col :xs="12" :sm="6">
        <div class="summary-tile">
          <span>物料总数</span>
          <strong>{{ summary.total }}</strong>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="summary-tile">
          <span>风险 SKU</span>
          <strong>{{ summary.risk }}</strong>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="summary-tile">
          <span>旧格式</span>
          <strong>{{ summary.legacy }}</strong>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="summary-tile">
          <span>建议治理</span>
          <strong>{{ summary.suggested }}</strong>
        </div>
      </el-col>
    </el-row>

    <el-alert
      class="notice"
      type="warning"
      :closable="false"
      show-icon
      title="应用后只会更新物料主数据的 SKU；库存、历史出入库、盘点明细仍按物料 ID 关联，不会被删除。旧 Excel 模板需要同步替换成新 SKU。"
    />

    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="rows"
      border
      row-key="id"
      class="governance-table"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="46" reserve-selection />
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="name" label="名称" min-width="180" />
      <el-table-column prop="category" label="分类" width="120" />
      <el-table-column prop="sku" label="当前 SKU" min-width="180" />
      <el-table-column label="类型" width="100">
        <template #default="{ row }">
          <el-tag :type="row.severity === 'risk' ? 'danger' : 'warning'">
            {{ row.severity === 'risk' ? '风险' : '旧格式' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="问题" min-width="240">
        <template #default="{ row }">
          <div class="issue-tags">
            <el-tag v-for="issue in row.issues" :key="issue" size="small" effect="plain">{{ issue }}</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="建议新 SKU" min-width="230">
        <template #default="{ row }">
          <el-input v-model="row.target_sku" size="small" />
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ElTable } from 'element-plus';
import { apiGet, apiPost } from '../api/client';
import { ElMessage, ElMessageBox } from '../utils/el-services';

type Severity = 'all' | 'risk' | 'legacy';

type GovernanceRow = {
  id: number;
  sku: string;
  name: string;
  category?: string | null;
  issues: string[];
  severity: 'risk' | 'legacy';
  suggested_sku: string;
  target_sku: string;
};

type Summary = {
  total: number;
  compliant: number;
  risk: number;
  legacy: number;
  suggested: number;
};

const tableRef = ref<InstanceType<typeof ElTable>>();
const severity = ref<Severity>('all');
const loading = ref(false);
const applying = ref(false);
const rows = ref<GovernanceRow[]>([]);
const selectedRows = ref<GovernanceRow[]>([]);
const summary = ref<Summary>({ total: 0, compliant: 0, risk: 0, legacy: 0, suggested: 0 });

const selectedInvalidCount = computed(() => selectedRows.value.filter((row) => !isValidSku(row.target_sku)).length);

function isValidSku(input: string) {
  return /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(String(input || '').trim());
}

function onSelectionChange(selection: GovernanceRow[]) {
  selectedRows.value = selection;
}

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ severity: severity.value, limit: '1000' });
    const result: any = await apiGet(`/api/items/sku-governance?${params.toString()}`, { cache: 'no-store' });
    rows.value = (Array.isArray(result?.data) ? result.data : []).map((row: any) => ({
      ...row,
      target_sku: String(row?.suggested_sku || ''),
    }));
    summary.value = {
      total: Number(result?.summary?.total || 0),
      compliant: Number(result?.summary?.compliant || 0),
      risk: Number(result?.summary?.risk || 0),
      legacy: Number(result?.summary?.legacy || 0),
      suggested: Number(result?.summary?.suggested || 0),
    };
    selectedRows.value = [];
    tableRef.value?.clearSelection();
  } catch (e: any) {
    ElMessage.error(e?.message || '扫描 SKU 失败');
  } finally {
    loading.value = false;
  }
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadCsv(list: GovernanceRow[]) {
  if (!list.length) return;
  const lines = [
    ['物料ID', '名称', '分类', '旧SKU', '建议新SKU', '问题'].map(csvCell).join(','),
    ...list.map((row) => [
      row.id,
      row.name,
      row.category || '',
      row.sku,
      row.target_sku || row.suggested_sku,
      row.issues.join('；'),
    ].map(csvCell).join(',')),
  ];
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sku_governance_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function applySelected() {
  if (!selectedRows.value.length) return;
  if (selectedInvalidCount.value > 0) {
    ElMessage.warning('已选行里有新 SKU 格式不合法，请先修正');
    return;
  }

  try {
    await ElMessageBox.confirm(
      `确认更新 ${selectedRows.value.length} 个物料 SKU？旧 Excel 模板和外部对账表需要同步替换。`,
      '应用 SKU 治理',
      { type: 'warning', confirmButtonText: '应用', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }

  applying.value = true;
  try {
    const payload = selectedRows.value.map((row) => ({
      id: row.id,
      old_sku: row.sku,
      new_sku: String(row.target_sku || '').trim(),
    }));
    const result: any = await apiPost('/api/items/sku-governance', { items: payload });
    ElMessage.success(`已更新 ${Number(result?.updated || payload.length)} 个 SKU`);
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '应用 SKU 治理失败');
  } finally {
    applying.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.sku-governance-page {
  max-width: 1680px;
  margin: 0 auto;
}

.page-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.summary-row {
  margin-bottom: 12px;
}

.summary-tile {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 84px;
}

.summary-tile span {
  color: #6b7280;
  font-size: 12px;
}

.summary-tile strong {
  font-size: 28px;
  line-height: 1;
  color: #111827;
}

.notice {
  margin-bottom: 12px;
}

.governance-table {
  border-radius: 8px;
}

.issue-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .page-actions {
    justify-content: stretch;
  }

  .page-actions > * {
    width: 100%;
  }
}
</style>
