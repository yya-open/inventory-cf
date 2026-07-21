<template>
  <div class="ui-page-shell sku-governance-page">
    <div class="ui-page-heading">
      <div>
        <div class="ui-page-heading__kicker">系统管理</div>
        <h1>SKU 治理</h1>
        <div class="ui-page-heading__desc">扫描配件物料中不规范或旧格式 SKU，生成映射建议，预检通过后批量应用。</div>
      </div>
      <div class="page-actions">
        <el-input v-model="keyword" clearable placeholder="搜索 SKU / 名称 / 分类" class="u-w-220" @keyup.enter="onSearch" />
        <el-select v-model="severity" class="u-w-130" @change="onSearch">
          <el-option label="全部问题" value="all" />
          <el-option label="风险 SKU" value="risk" />
          <el-option label="旧格式" value="legacy" />
        </el-select>
        <el-select v-model="issueType" class="u-w-150" @change="onSearch">
          <el-option label="全部类型" value="all" />
          <el-option label="小写字母" value="lowercase" />
          <el-option label="中文/特殊符号" value="special" />
          <el-option label="长度过短" value="short" />
          <el-option label="缺少短横线" value="no_dash" />
          <el-option label="旧自动格式" value="legacy_format" />
        </el-select>
        <el-button :loading="loading" @click="load">扫描</el-button>
        <el-button :disabled="!rows.length" @click="downloadCsv(rows)">下载本页</el-button>
        <el-button :disabled="!selectedRows.length" @click="downloadCsv(selectedRows)">下载已选</el-button>
        <el-button type="primary" :loading="prechecking" :disabled="!selectedRows.length" @click="precheckSelected">
          预检已选 {{ selectedRows.length || '' }}
        </el-button>
      </div>
    </div>

    <el-row :gutter="12" class="summary-row">
      <el-col :xs="12" :sm="6">
        <div class="summary-tile"><span>当前筛选物料</span><strong>{{ summary.total }}</strong></div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="summary-tile"><span>风险 SKU</span><strong>{{ summary.risk }}</strong></div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="summary-tile"><span>旧格式</span><strong>{{ summary.legacy }}</strong></div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="summary-tile"><span>当前结果</span><strong>{{ total }}</strong></div>
      </el-col>
    </el-row>

    <el-alert
      class="notice"
      type="warning"
      :closable="false"
      show-icon
      title="应用后会更新物料主数据 SKU，并自动把旧 SKU 保存为别名；库存、历史出入库、盘点明细仍按物料 ID 关联。"
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

    <div class="pager-wrap">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        background
        layout="total, sizes, prev, pager, next, jumper"
        :page-sizes="[20, 50, 100, 200]"
        @current-change="load"
        @size-change="onPageSizeChange"
      />
    </div>

    <el-dialog v-model="precheckDialogVisible" title="SKU 治理预检报告" width="760px">
      <div v-if="precheckReport" class="precheck-body">
        <el-alert
          :type="precheckReport.ok ? 'success' : 'error'"
          :closable="false"
          show-icon
          :title="precheckReport.ok ? '预检通过，可以应用' : '预检未通过，请处理错误后重试'"
        />
        <el-row :gutter="10">
          <el-col :span="6"><div class="precheck-tile"><span>提交</span><strong>{{ precheckReport.total }}</strong></div></el-col>
          <el-col :span="6"><div class="precheck-tile"><span>有效</span><strong>{{ precheckReport.valid_count }}</strong></div></el-col>
          <el-col :span="6"><div class="precheck-tile"><span>将建别名</span><strong>{{ precheckReport.alias_to_create_count }}</strong></div></el-col>
          <el-col :span="6"><div class="precheck-tile"><span>人工修改</span><strong>{{ precheckReport.manually_changed_count }}</strong></div></el-col>
        </el-row>

        <div v-if="precheckReport.errors.length" class="precheck-section">
          <div class="section-title">错误</div>
          <el-table :data="precheckReport.errors" border size="small" max-height="220">
            <el-table-column prop="code" label="代码" width="150" />
            <el-table-column prop="message" label="说明" min-width="300" />
          </el-table>
        </div>
        <div v-if="precheckReport.warnings.length" class="precheck-section">
          <div class="section-title">提示</div>
          <el-alert
            v-for="warning in precheckReport.warnings"
            :key="warning.code"
            class="warning-line"
            type="warning"
            :closable="false"
            :title="warning.message"
          />
        </div>
      </div>
      <template #footer>
        <el-button @click="precheckDialogVisible=false">关闭</el-button>
        <el-button type="primary" :loading="applying" :disabled="!precheckReport?.ok" @click="applyAfterPrecheck">确认应用</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ElTable } from 'element-plus';
import { apiGet, apiPost } from '../api/client';
import { ElMessage } from '../utils/el-services';

type Severity = 'all' | 'risk' | 'legacy';
type IssueType = 'all' | 'lowercase' | 'special' | 'short' | 'no_dash' | 'legacy_format';

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

type PrecheckReport = {
  ok: boolean;
  total: number;
  valid_count: number;
  manually_changed_count: number;
  alias_to_create_count: number;
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
};

const tableRef = ref<InstanceType<typeof ElTable>>();
const severity = ref<Severity>('all');
const issueType = ref<IssueType>('all');
const keyword = ref('');
const loading = ref(false);
const prechecking = ref(false);
const applying = ref(false);
const rows = ref<GovernanceRow[]>([]);
const selectedRows = ref<GovernanceRow[]>([]);
const summary = ref<Summary>({ total: 0, compliant: 0, risk: 0, legacy: 0, suggested: 0 });
const page = ref(1);
const pageSize = ref(50);
const total = ref(0);
const precheckDialogVisible = ref(false);
const precheckReport = ref<PrecheckReport | null>(null);
const precheckPayload = ref<any[]>([]);

const selectedInvalidCount = computed(() => selectedRows.value.filter((row) => !isValidSku(row.target_sku)).length);

function isValidSku(input: string) {
  return /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(String(input || '').trim());
}

function onSelectionChange(selection: GovernanceRow[]) {
  selectedRows.value = selection;
}

function onSearch() {
  page.value = 1;
  load();
}

function onPageSizeChange() {
  page.value = 1;
  load();
}

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams({
      severity: severity.value,
      issue_type: issueType.value,
      keyword: keyword.value.trim(),
      page: String(page.value),
      page_size: String(pageSize.value),
    });
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
    total.value = Number(result?.total || 0);
    page.value = Number(result?.page || page.value);
    pageSize.value = Number(result?.pageSize || pageSize.value);
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

function buildPayload() {
  return selectedRows.value.map((row) => ({
    id: row.id,
    old_sku: row.sku,
    new_sku: String(row.target_sku || '').trim(),
    suggested_sku: row.suggested_sku,
  }));
}

async function precheckSelected() {
  if (!selectedRows.value.length) return;
  if (selectedInvalidCount.value > 0) {
    ElMessage.warning('已选行里有新 SKU 格式不合法，请先修正');
    return;
  }
  prechecking.value = true;
  try {
    precheckPayload.value = buildPayload();
    const result: any = await apiPost('/api/items/sku-governance', { action: 'precheck', items: precheckPayload.value });
    precheckReport.value = result?.data || null;
    precheckDialogVisible.value = true;
  } catch (e: any) {
    ElMessage.error(e?.message || 'SKU 治理预检失败');
  } finally {
    prechecking.value = false;
  }
}

async function applyAfterPrecheck() {
  if (!precheckReport.value?.ok || !precheckPayload.value.length) return;
  applying.value = true;
  try {
    const result: any = await apiPost('/api/items/sku-governance', { items: precheckPayload.value });
    ElMessage.success(`已更新 ${Number(result?.updated || precheckPayload.value.length)} 个 SKU，创建 ${Number(result?.alias_created || 0)} 个旧 SKU 别名`);
    precheckDialogVisible.value = false;
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

.summary-tile,
.precheck-tile {
  border: 1px solid var(--border);
  border-radius:var(--radius-md);
  background: var(--surface);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 84px;
}

.summary-tile span,
.precheck-tile span {
  color: var(--muted);
  font-size: 12px;
}

.summary-tile strong,
.precheck-tile strong {
  font-size: 28px;
  line-height: 1;
  color: var(--ink);
}

.notice,
.precheck-section,
.warning-line {
  margin-bottom: 12px;
}

.governance-table {
  border-radius:var(--radius-md);
}

.issue-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.pager-wrap {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
}

.precheck-body {
  display: grid;
  gap: 12px;
}

.section-title {
  font-weight: 700;
  margin-bottom: 8px;
}

@media (max-width: 768px) {
  .page-actions {
    justify-content: stretch;
  }

  .page-actions > * {
    width: 100% !important;
  }
}
</style>
