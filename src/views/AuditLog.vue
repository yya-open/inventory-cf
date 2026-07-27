<template>
  <div class="ui-page-shell audit-page">
  <el-card class="audit-card ui-panel" shadow="never">
    <template #header>
      <div class="audit-header">
        <div class="title">
          审计日志
        </div>
        <div class="tools">
          <el-button
            type="primary"
            @click="onSearch"
          >
            查询
          </el-button>
          <el-button @click="reset">
            重置
          </el-button>
          <el-button @click="exportCurrentRows">
            导出当前页
          </el-button>
          <el-button @click="exportFilteredRows">
            导出筛选结果
          </el-button>
          <el-button
            type="info"
            plain
            @click="retentionRef?.open()"
          >
            保留策略
          </el-button>
          <el-button
            v-if="isAdmin"
            type="danger"
            plain
            :disabled="selectedIds.length===0"
            @click="deleteSelected"
          >
            删除选中 ({{ selectedIds.length }})
          </el-button>
        </div>
      </div>

      <el-form
        class="audit-filters ui-filter-panel"
        :inline="true"
        @submit.prevent
      >
        <el-form-item>
          <el-input
            v-model="keyword"
            placeholder="搜索：用户/动作/实体/ID"
            clearable
            class="u-w-240"
          />
        </el-form-item>
        <el-form-item>
          <el-select
            v-model="action"
            placeholder="动作"
            clearable
            filterable
            class="u-w-190"
            @change="onSearch"
          >
            <el-option
              v-for="opt in actionFilterOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select
            v-model="entity"
            placeholder="实体"
            clearable
            filterable
            class="u-w-190"
            @change="onSearch"
          >
            <el-option
              v-for="opt in entityFilterOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="entityId"
            placeholder="对象ID（如资产ID / tx_no）"
            clearable
            class="u-w-190"
          />
        </el-form-item>
        <el-form-item>
          <el-select
            v-model="moduleFilter"
            placeholder="模块"
            clearable
            class="u-w-150"
            @change="onSearch"
          >
            <el-option v-for="opt in moduleOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-switch v-model="highRiskOnly" active-text="高风险" inactive-text="全部" @change="onSearch" />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="user"
            placeholder="用户（如 admin）"
            clearable
            class="u-w-150"
          />
        </el-form-item>
        <el-form-item>
          <el-date-picker
            v-model="range"
            type="daterange"
            range-separator="-"
            start-placeholder="开始"
            end-placeholder="结束"
          />
        </el-form-item>
        <el-form-item>
          <el-select
            v-model="sortBy"
            placeholder="排序字段"
            class="u-w-140"
            @change="onSearch"
          >
            <el-option
              label="时间"
              value="created_at"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select
            v-model="sortDir"
            placeholder="方向"
            class="u-w-120"
            @change="onSearch"
          >
            <el-option
              label="倒序"
              value="desc"
            />
            <el-option
              label="正序"
              value="asc"
            />
          </el-select>
        </el-form-item>
      </el-form>
    </template>

    <LazyMountBlock title="正在装载审计列表…" min-height="420px">
      <el-table
        v-loading="loading"
        :data="rows"
        border
        class="u-w-full"
        @selection-change="onSelect"
      >
      <el-table-column
        v-if="isAdmin"
        type="selection"
        width="48"
      />
      <el-table-column
        label="#"
        width="80"
      >
        <template #default="{ $index }">
          {{ (page - 1) * pageSize + $index + 1 }}
        </template>
      </el-table-column>
      <el-table-column
        label="时间"
        min-width="170"
      >
        <template #default="{ row }">
          {{ formatTime(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column
        prop="username"
        label="用户"
        width="130"
      />
      <el-table-column
        label="动作"
        min-width="160"
      >
        <template #default="{ row }">
          <el-tag
            :title="row.action"
            :type="tagType(row.action)"
            effect="light"
          >
            {{ actionLabel(row.action) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="实体"
        min-width="180"
      >
        <template #default="{ row }">
          <div class="entity-cell">
            <div class="entity-name">
              {{ row.item_name || row.user_name || entityLabel(row.entity) || "-" }}
            </div>
            <div
              v-if="row.item_name || row.user_name"
              class="entity-meta"
            >
              {{ entityLabel(row.entity) }}
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        width="260"
        fixed="right"
      >
        <template #default="{ row }">
          <div class="audit-row-actions">
          <el-button
            class="audit-action-btn"
            text
            type="primary"
            @click="payloadRef?.open(row)"
          >
            查看
          </el-button>
          <el-button class="audit-action-btn audit-action-btn--wide" text @click="focusEntityHistory(row)">同对象历史</el-button>
          <el-popconfirm
            v-if="isAdmin"
            title="确认删除该审计日志？"
            @confirm="deleteOne(row.id)"
          >
            <template #reference>
              <el-button
                class="audit-action-btn"
                text
                type="danger"
              >
                删除
              </el-button>
            </template>
          </el-popconfirm>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <div class="u-flex u-justify-end u-mt-12">
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

    <AuditPayloadDialog ref="payloadRef" @focus-entity="focusEntityHistory" />

    <AuditRetentionDialog ref="retentionRef" />
  </el-card>
  </div>
</template>

<script setup lang="ts">
import { ElPopconfirm } from 'element-plus/es/components/popconfirm/index';
import { ref, onMounted, computed, watch } from "vue";
import { useDebouncedFn } from "../composables/useDebouncedFn";
import { useRoute } from "vue-router";
import { apiGet, apiPost } from "../api/client";
import { can, canCapability } from "../store/auth";
import { confirmAction, promptAction, showError, showSuccess, showWarning } from "../utils/feedback";
import { exportToXlsx } from "../utils/excel";
import { readJsonStorage, writeJsonStorage } from "../utils/storage";
import { getCachedSystemSettings } from "../api/systemSettings";
import LazyMountBlock from "../components/LazyMountBlock.vue";
import AuditRetentionDialog from "../components/AuditRetentionDialog.vue";
import AuditPayloadDialog from "../components/AuditPayloadDialog.vue";
import {
  ACTION_LABEL,
  ENTITY_LABEL,
  MODULE_LABEL,
  moduleOptions,
  actionLabel,
  entityLabel,
  formatTime,
  getModuleOf,
  tagType,
} from "../utils/auditLogFormat";

const STORAGE_KEY = 'inventory:audit-log:filters';
const persistedState = readJsonStorage(STORAGE_KEY, {
  keyword: '',
  sortBy: 'created_at',
  sortDir: 'desc',
  action: '',
  entity: '',
  entityId: '',
  user: '',
  moduleFilter: '',
  highRiskOnly: false,
  range: null as [string, string] | null,
  pageSize: getCachedSystemSettings().ui_default_page_size,
});

const rows = ref<any[]>([]);
const loading = ref(false);

const keyword = ref(String(persistedState.keyword || ""));
const sortBy = ref<string>(String(persistedState.sortBy || "created_at"));
const sortDir = ref<string>(String(persistedState.sortDir || "desc"));
const action = ref(String(persistedState.action || ""));
const entity = ref(String(persistedState.entity || ""));
const entityId = ref(String((persistedState as any).entityId || ''));
const user = ref(String(persistedState.user || ""));
const moduleFilter = ref(String((persistedState as any).moduleFilter || ""));
const highRiskOnly = ref(Boolean((persistedState as any).highRiskOnly || false));
const range = ref<any>(Array.isArray(persistedState.range) && persistedState.range.length === 2
  ? persistedState.range.map((value) => new Date(value))
  : null);

const page = ref(1);
const pageSize = ref(Number(persistedState.pageSize || getCachedSystemSettings().ui_default_page_size || 50));
const total = ref(0);

const actionFilterOptions = computed(() => {
  const keys = Array.from(new Set([
    ...Object.keys(ACTION_LABEL),
    action.value,
    ...rows.value.map((row) => String(row?.action || '').trim()).filter(Boolean),
  ].filter(Boolean)));
  return keys
    .sort((a, b) => actionLabel(a).localeCompare(actionLabel(b), "zh-CN"))
    .map((k) => ({ value: k, label: actionLabel(k) }));
});

const entityFilterOptions = computed(() => {
  const keys = Array.from(new Set([
    ...Object.keys(ENTITY_LABEL),
    entity.value,
    ...rows.value.map((row) => String(row?.entity || '').trim()).filter(Boolean),
  ].filter(Boolean)));
  return keys
    .sort((a, b) => entityLabel(a).localeCompare(entityLabel(b), "zh-CN"))
    .map((k) => ({ value: k, label: entityLabel(k) }));
});

const retentionRef = ref<{ open: () => void } | null>(null);
const payloadRef = ref<{ open: (row: any) => void } | null>(null);

const selectedIds = ref<number[]>([]);
const isAdmin = computed(() => can("admin"));
const canAsyncJobManage = computed(() => canCapability('system.jobs.manage'));
const route = useRoute();

function onSelect(list: any[]) {
  selectedIds.value = (list || []).map(r => Number(r.id)).filter(n => Number.isFinite(n));
}

function serializeRange() {
  if (!Array.isArray(range.value) || range.value.length !== 2) return null;
  return range.value.map((value: Date | string) => new Date(value).toISOString()) as [string, string];
}

function persistState() {
  writeJsonStorage(STORAGE_KEY, {
    keyword: keyword.value || '',
    sortBy: sortBy.value || 'created_at',
    sortDir: sortDir.value || 'desc',
    action: action.value || '',
    entity: entity.value || '',
    entityId: entityId.value || '',
    user: user.value || '',
    moduleFilter: moduleFilter.value || '',
    highRiskOnly: Boolean(highRiskOnly.value),
    range: serializeRange(),
    pageSize: Number(pageSize.value || 50),
  });
}

let suppressAutoSearch = false;
const scheduleSearch = useDebouncedFn(() => onSearch(), 320);
let loadSeq = 0;
let loadController: AbortController | null = null;

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

watch([keyword, action, entity, entityId, user, moduleFilter, highRiskOnly, sortBy, sortDir, pageSize], persistState);
watch(range, persistState, { deep: true });
watch(keyword, (_value, oldValue) => {
  if (suppressAutoSearch || oldValue === undefined) return;
  scheduleSearch();
});
watch(user, (_value, oldValue) => {
  if (suppressAutoSearch || oldValue === undefined) return;
  scheduleSearch();
});
watch(entityId, (_value, oldValue) => {
  if (suppressAutoSearch || oldValue === undefined) return;
  scheduleSearch();
});
watch(range, (_value, oldValue) => {
  if (suppressAutoSearch || oldValue === undefined) return;
  scheduleSearch.cancel();
  onSearch();
}, { deep: true });


function applyRouteQuery(loadAfter = true) {
  const query = route.query || {};
  const hasRouteFilters = ['keyword', 'action', 'entity', 'entity_id', 'user', 'module', 'high_risk'].some((key) => query[key] != null && String(query[key]).trim() !== '');
  if (!hasRouteFilters) return;
  suppressAutoSearch = true;
  if (query.keyword != null) keyword.value = String(query.keyword || '');
  if (query.action != null) action.value = String(query.action || '');
  if (query.entity != null) entity.value = String(query.entity || '');
  if (query.entity_id != null) entityId.value = String(query.entity_id || '');
  if (query.user != null) user.value = String(query.user || '');
  if (query.module != null) moduleFilter.value = String(query.module || '');
  if (query.high_risk != null) highRiskOnly.value = ['1', 'true', 'yes'].includes(String(query.high_risk).toLowerCase());
  page.value = 1;
  suppressAutoSearch = false;
  persistState();
  if (loadAfter) load();
}

function onSearch(){
  scheduleSearch.cancel();
  page.value = 1;
  load();
}
function onPageChange(){ load(); }
function onPageSizeChange(){ page.value = 1; load(); }

function reset(){
  suppressAutoSearch = true;
  keyword.value = "";
  action.value = "";
  entity.value = "";
  entityId.value = "";
  user.value = "";
  moduleFilter.value = "";
  highRiskOnly.value = false;
  range.value = null;
  sortBy.value = "created_at";
  sortDir.value = "desc";
  page.value = 1;
  suppressAutoSearch = false;
  scheduleSearch.cancel();
  load();
}

function focusEntityHistory(row: any) {
  if (!row?.entity_id) return;
  entity.value = row.entity || '';
  entityId.value = String(row.entity_id || '');
  page.value = 1;
  load();
}

function buildAuditParams(targetPage: number, targetPageSize: number) {
  const params = new URLSearchParams();
  if (keyword.value) params.set('keyword', keyword.value);
  if (action.value) params.set('action', action.value);
  if (entity.value) params.set('entity', entity.value);
  if (entityId.value) params.set('entity_id', entityId.value);
  if (user.value) params.set('user', user.value);
  if (moduleFilter.value) params.set('module', moduleFilter.value);
  if (highRiskOnly.value) params.set('high_risk', '1');
  if (range.value?.length === 2) {
    const s = new Date(range.value[0]);
    const e = new Date(range.value[1]);
    params.set('date_from', s.toISOString().slice(0, 10));
    params.set('date_to', e.toISOString().slice(0, 10));
  }
  params.set('page', String(targetPage));
  params.set('page_size', String(targetPageSize));
  if (sortBy.value) params.set('sort_by', sortBy.value);
  if (sortDir.value) params.set('sort_dir', sortDir.value);
  return params;
}

async function createAuditExportJob(scope: 'current' | 'all') {
  const params = buildAuditParams(page.value, pageSize.value);
  const request_json: Record<string, any> = { scope, max_rows: scope === 'all' ? 5000 : undefined };
  params.forEach((v, k) => { request_json[k] = v; });
  return apiPost('/api/jobs', { job_type: 'AUDIT_EXPORT', permission_scope: 'audit_export', request_json });
}

async function fetchAuditExportRows(scope: 'current' | 'all') {
  const params = buildAuditParams(page.value, pageSize.value);
  params.set('scope', scope);
  if (scope === 'all') params.set('max_rows', '5000');
  const res: any = await apiGet(`/api/audit/export?${params.toString()}`);
  return res;
}

function buildAuditExportFilename(scope: 'current' | 'all') {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return scope === 'current' ? `audit_current_${stamp}.xlsx` : `audit_filtered_${stamp}.xlsx`;
}

async function exportAuditRows(rowsToExport: any[], filename: string) {
  await exportToXlsx({
    filename,
    sheetName: '审计日志',
    headers: [
      { key: 'created_at', title: '时间' },
      { key: 'username', title: '用户' },
      { key: 'module', title: '模块' },
      { key: 'action_label', title: '动作' },
      { key: 'entity_label', title: '实体' },
      { key: 'entity_id', title: '实体ID' },
      { key: 'object_name', title: '对象名称' },
    ],
    rows: rowsToExport.map((row: any) => ({
      created_at: formatTime(row.created_at),
      username: row.username || '-',
      module: MODULE_LABEL[getModuleOf(row)] || '其他',
      action_label: actionLabel(row.action),
      entity_label: entityLabel(row.entity),
      entity_id: row.entity_id ?? '-',
      object_name: row.item_name || row.user_name || '-',
    })),
  });
}

async function exportFilteredRows() {
  try {
    if (canAsyncJobManage.value) {
      await createAuditExportJob('all');
      showSuccess('已创建审计导出任务，请前往 系统 > 批量任务中心 下载');
      return;
    }
    const result: any = await fetchAuditExportRows('all');
    await exportAuditRows(result?.data || [], buildAuditExportFilename('all'));
    if (result?.limited) showWarning(`导出达到上限：${result?.exported || 0} 条`);
  } catch (error: any) {
    showError(error?.message || '导出筛选结果失败');
  }
}

async function exportCurrentRows() {
  try {
    if (canAsyncJobManage.value) {
      await createAuditExportJob('current');
      showSuccess('已创建当前页审计导出任务，请前往 系统 > 批量任务中心 下载');
      return;
    }
    const result: any = await fetchAuditExportRows('current');
    await exportAuditRows(result?.data || [], buildAuditExportFilename('current'));
  } catch (error: any) {
    showError(error?.message || '导出当前页失败');
  }
}

async function load(){
  const currentSeq = ++loadSeq;
  loadController?.abort();
  loadController = new AbortController();
  loading.value = true;
  try{
    const params = buildAuditParams(page.value, pageSize.value);

    const j:any = await apiGet(`/api/audit/list?${params.toString()}`, { signal: loadController.signal });
    if (currentSeq !== loadSeq) return;
    rows.value = (j.data || []).map((r:any)=>({ ...r }));
    total.value = Number(j.total || 0);
  }catch(e:any){
    if (currentSeq !== loadSeq || isAbortError(e)) return;
    showError(e.message || "加载失败");
  }finally{
    if (currentSeq === loadSeq) loading.value = false;
  }
}

async function hardConfirm(expected: string, title: string) {
  const { value } = await promptAction({
    message: `请输入「${expected}」确认操作（区分大小写）`,
    title,
    type: 'warning',
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    inputPlaceholder: expected,
    inputValidator: (v: string) => (String(v || '').trim() === expected ? true : `需要输入「${expected}」`),
  });
  return String(value || "").trim();
}

async function deleteOne(id: number){
  try{
    await hardConfirm("删除", "二次确认");
    await apiPost(`/api/audit/delete`, { id, confirm: "删除" });
    showSuccess("已删除");
    // if delete makes current page empty, go back one page.
    if (rows.value.length === 1 && page.value > 1) page.value -= 1;
    await load();
  }catch(e:any){
    if (e === "cancel" || e === "close") return;
    showError(e.message || "删除失败");
  }
}

async function deleteSelected(){
  const ids = selectedIds.value.slice();
  if (!ids.length) return;
  try{
    await confirmAction({
      message: `确认删除选中的 ${ids.length} 条审计日志？`,
      title: '删除确认',
      type: 'warning',
    });
    await hardConfirm("删除", "二次确认");
    await apiPost(`/api/audit/delete`, { ids, confirm: "删除" });
    showSuccess("已删除");
    selectedIds.value = [];
    // adjust page if needed
    if (rows.value.length <= ids.length && page.value > 1) page.value -= 1;
    await load();
  }catch(e:any){
    if (e === "cancel" || e === "close") return;
    showError(e.message || "删除失败");
  }
}

watch(() => route.fullPath, (_value, oldValue) => {
  if (oldValue === undefined) return;
  applyRouteQuery(true);
});

onMounted(() => {
  persistState();
  if (Object.keys(route.query || {}).length) {
    applyRouteQuery(true);
    return;
  }
  load();
});
</script>

<style scoped>

.audit-page{max-width:1680px;margin:0 auto}
.audit-card{border-radius:var(--radius-md)}
.audit-header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.title{font-weight:800;font-size:16px}
.tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tools :deep(.el-button){margin-left:0}
.audit-row-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap;align-content:flex-start}
.audit-row-actions :deep(.el-button){margin-left:0}
.audit-action-btn{width:58px;min-height:28px;padding:0 8px;border-radius:var(--radius-sm);justify-content:center;font-weight:600}
.audit-action-btn--wide{width:98px}
.audit-filters{margin-top:0}
.entity-cell{display:flex;flex-direction:column;gap:2px;line-height:1.15}
.entity-name{font-weight:600}
.entity-meta{font-size:12px;color:var(--subtle)}

@media (max-width: 768px){
  .audit-header,
  .tools{
    align-items:stretch;
  }

  .audit-header > *,
  .tools,
  .tools :deep(.el-button){
    width:100%;
    max-width:100%;
  }
}

</style>
