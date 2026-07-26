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
            @click="openRetention"
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
            @click="openPayload(row)"
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

    <el-dialog
      v-model="showPayload"
      title="审计详情"
      width="860px"
    >
      <div class="payload-toolbar">
        <el-switch
          v-model="prettyMode"
          active-text="格式化"
          inactive-text="原始"
        />
        <el-button
          :disabled="!payloadToCopy"
          @click="copyPayload"
        >
          复制
        </el-button>
        <el-button :disabled="!currentPayloadRow?.entity_id" @click="currentPayloadRow && focusEntityHistory(currentPayloadRow)">同对象历史</el-button>
      </div>

      <el-tabs v-model="activePayloadTab">
        <el-tab-pane label="概要" name="summary">
          <el-descriptions :column="2" border size="small" class="payload-summary-meta">
            <el-descriptions-item label="动作">
              {{ currentPayloadRow ? actionLabel(currentPayloadRow.action) : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="实体">
              {{ currentPayloadRow ? entityLabel(currentPayloadRow.entity) : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="用户">
              {{ currentPayloadRow?.username || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="时间">
              {{ currentPayloadRow ? formatTime(currentPayloadRow.created_at) : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="实体ID">
              {{ currentPayloadRow?.entity_id ?? '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="对象名称">
              {{ currentPayloadRow?.item_name || currentPayloadRow?.user_name || '-' }}
            </el-descriptions-item>
          </el-descriptions>
          <div v-if="payloadSummaryEntries.length" class="payload-kv-grid">
            <div v-for="item in payloadSummaryEntries" :key="item.key" class="payload-kv-item">
              <div class="payload-kv-label">{{ item.label }}</div>
              <div class="payload-kv-value">{{ item.value }}</div>
            </div>
          </div>
          <el-empty v-else description="暂无结构化摘要" />
        </el-tab-pane>
        <el-tab-pane label="字段变更" name="diff">
          <div v-if="payloadDiffEntries.length" class="payload-diff-list">
            <div v-for="item in payloadDiffEntries" :key="item.key" class="payload-diff-item">
              <div class="payload-diff-key">{{ item.label }}</div>
              <div class="payload-diff-values">
                <div class="payload-diff-cell before">
                  <span class="payload-diff-caption">修改前</span>
                  <div class="payload-diff-text">{{ item.before }}</div>
                </div>
                <div class="payload-diff-cell after">
                  <span class="payload-diff-caption">修改后</span>
                  <div class="payload-diff-text">{{ item.after }}</div>
                </div>
              </div>
            </div>
          </div>
          <el-empty v-else description="当前审计记录没有字段差异" />
        </el-tab-pane>
        <el-tab-pane label="JSON" name="json">
          <el-scrollbar
            height="420px"
            class="payload-box"
          >
            <pre class="payload-pre">{{ displayPayload }}</pre>
          </el-scrollbar>
        </el-tab-pane>
      </el-tabs>

      <template #footer>
        <el-button @click="showPayload=false">
          关闭
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showRetention"
      title="审计保留与归档策略"
      width="760px"
    >
      <div class="u-text-muted u-mb-10">
        当前策略：保留近 <b>{{ retentionDays }}</b> 天；上次清理：{{ retentionLast || "-" }}；上次归档：{{ archiveLast || "-" }}
      </div>
      <el-alert
        v-if="auditWarnings.length"
        type="warning"
        show-icon
        :closable="false"
        class="u-mb-12"
      >
        <div v-for="item in auditWarnings" :key="item.code">{{ item.message }}</div>
      </el-alert>
      <div class="audit-retention-stats">
        <div class="stats-item"><span>审计行数</span><b>{{ auditStats.total_rows }}</b></div>
        <div class="stats-item"><span>可归档</span><b>{{ auditStats.eligible_rows }}</b></div>
        <div class="stats-item"><span>估算体积</span><b>{{ auditStats.approx_audit_mb }} MB</b></div>
        <div class="stats-item"><span>数据库体积</span><b>{{ auditStats.db_size_mb }} MB</b></div>
      </div>
      <el-form label-width="140px">
        <el-form-item label="保留天数">
          <el-input-number v-model="retentionDaysEdit" :min="1" :max="3650" controls-position="right" />
        </el-form-item>
        <el-form-item label="自动归档">
          <el-switch v-model="archiveEnabled" active-text="开启" inactive-text="关闭" />
        </el-form-item>
        <el-form-item label="归档门槛（天）">
          <el-input-number v-model="archiveAfterDays" :min="1" :max="3650" controls-position="right" />
        </el-form-item>
        <el-form-item label="归档后删除源记录">
          <el-switch v-model="deleteAfterArchive" active-text="是" inactive-text="否" />
        </el-form-item>
        <el-form-item label="单次归档上限">
          <el-input-number v-model="maxArchiveRows" :min="100" :max="50000" :step="500" controls-position="right" />
        </el-form-item>
        <el-form-item label="库体积预警 (MB)">
          <el-input-number v-model="warnDbSizeMb" :min="64" :max="4096" :step="16" controls-position="right" />
        </el-form-item>
        <el-form-item label="审计行数预警">
          <el-input-number v-model="warnAuditRows" :min="1000" :max="5000000" :step="1000" controls-position="right" />
        </el-form-item>
        <el-form-item label="审计体积预警 (MB)">
          <el-input-number v-model="warnAuditBytesMb" :min="16" :max="4096" :step="16" controls-position="right" />
        </el-form-item>
        <el-form-item label="立即清理">
          <el-switch v-model="runCleanup" active-text="是" inactive-text="否" />
        </el-form-item>
        <el-alert v-if="runCleanup" type="warning" show-icon :closable="false">将删除早于保留天数的审计日志。确认后不可恢复。</el-alert>
      </el-form>
      <div class="archive-history" v-if="archiveRuns.length">
        <div class="archive-history__title">最近归档</div>
        <div class="archive-history__list">
          <div v-for="run in archiveRuns" :key="run.id" class="archive-history__row">
            <span>{{ run.created_at }}</span>
            <span>截止 {{ run.archive_before }}</span>
            <span>导出 {{ run.exported_rows }}</span>
            <span v-if="run.deleted_rows">删除 {{ run.deleted_rows }}</span>
            <span>{{ run.result_filename || '-' }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showRetention=false">取消</el-button>
        <el-button type="warning" :loading="archiveSubmitting" @click="createArchiveJob">立即归档</el-button>
        <el-button type="primary" :loading="retentionSaving" @click="saveRetention">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
  </div>
</template>

<script setup lang="ts">
import { ElDescriptions, ElDescriptionsItem } from 'element-plus/es/components/descriptions/index';
import { ElTabPane, ElTabs } from 'element-plus/es/components/tabs/index';
import { ElPopconfirm } from 'element-plus/es/components/popconfirm/index';
import { ElScrollbar } from 'element-plus/es/components/scrollbar/index';
import { ref, onMounted, computed, watch } from "vue";
import { useDebouncedFn } from "../composables/useDebouncedFn";
import { useRoute } from "vue-router";
import { apiGet, apiPost } from "../api/client";
import { can, canCapability, canPerm } from "../store/auth";
import { ElMessage, ElMessageBox } from "../utils/el-services";
import { exportToXlsx } from "../utils/excel";
import { readJsonStorage, writeJsonStorage } from "../utils/storage";
import { getCachedSystemSettings } from "../api/systemSettings";
import LazyMountBlock from "../components/LazyMountBlock.vue";
import {
  ACTION_LABEL,
  ENTITY_LABEL,
  MODULE_LABEL,
  HIDDEN_PAYLOAD_KEYS,
  moduleOptions,
  fieldLabel,
  actionLabel,
  entityLabel,
  formatTime,
  getModuleOf,
  formatAuditValue,
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

const showPayload = ref(false);
const rawPayload = ref("");
const prettyPayload = ref("");
const prettyMode = ref(true);
const activePayloadTab = ref('summary');
const currentPayloadRow = ref<any | null>(null);

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

const displayPayload = computed(() => {
  if (!prettyMode.value) return rawPayload.value || "";
  return prettyPayload.value || rawPayload.value || "";
});
const payloadToCopy = computed(() => displayPayload.value || "");
const parsedPayload = computed(() => {
  const pretty = tryPrettyJson(rawPayload.value);
  if (!pretty) return null;
  try {
    return JSON.parse(pretty);
  } catch {
    return null;
  }
});

const payloadSummaryEntries = computed(() => {
  const payload = parsedPayload.value;
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') return [] as Array<{ key: string; label: string; value: string }>;
  if ('before' in payload || 'after' in payload) return [] as Array<{ key: string; label: string; value: string }>;
  return Object.entries(payload)
    .filter(([key]) => !HIDDEN_PAYLOAD_KEYS.has(key))
    .slice(0, 16)
    .map(([key, value]) => ({ key, label: fieldLabel(key), value: formatAuditValue(value) }));
});

const payloadDiffEntries = computed(() => {
  const payload = parsedPayload.value as any;
  const fieldDiffs = Array.isArray(payload?.field_diffs) ? payload.field_diffs : [];
  if (fieldDiffs.length) {
    return fieldDiffs
      .filter((item: any) => {
        const key = String(item?.key || '');
        const last = key.split('.').filter(Boolean).pop() || key;
        return !HIDDEN_PAYLOAD_KEYS.has(key) && !HIDDEN_PAYLOAD_KEYS.has(last);
      })
      .map((item: any) => {
        const key = String(item?.key || '');
        const last = key.split('.').filter(Boolean).pop() || key;
        const baseLabel = fieldLabel(last);
        const label = key && key !== last ? `${baseLabel}（${key}）` : baseLabel;
        return {
          key,
          label,
          before: formatAuditValue(item?.before),
          after: formatAuditValue(item?.after),
        };
      })
      .filter((item: any) => item.before !== item.after);
  }

  const before = payload?.before;
  const after = payload?.after;
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return [] as Array<{ key: string; label: string; before: string; after: string }>;
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter((key) => !HIDDEN_PAYLOAD_KEYS.has(key));
  return keys
    .map((key) => {
      const beforeValue = formatAuditValue(before[key]);
      const afterValue = formatAuditValue(after[key]);
      return { key, label: fieldLabel(key), before: beforeValue, after: afterValue };
    })
    .filter((item) => item.before !== item.after);
});

// retention policy
const showRetention = ref(false);
const retentionDays = ref(180);
const retentionLast = ref<string | null>(null);
const retentionDaysEdit = ref(180);
const archiveEnabled = ref(false);
const archiveAfterDays = ref(90);
const deleteAfterArchive = ref(false);
const maxArchiveRows = ref(5000);
const warnDbSizeMb = ref(350);
const warnAuditRows = ref(200000);
const warnAuditBytesMb = ref(128);
const archiveLast = ref<string | null>(null);
const archiveRuns = ref<any[]>([]);
const auditWarnings = ref<Array<{ code: string; message: string }>>([]);
const auditStats = ref({ total_rows: 0, eligible_rows: 0, approx_audit_mb: 0, db_size_mb: 0 });
const runCleanup = ref(false);
const retentionSaving = ref(false);
const archiveSubmitting = ref(false);

function applyRetentionState(data: any) {
  retentionDays.value = Number(data?.retention_days || 180);
  retentionLast.value = data?.last_cleanup_at || null;
  retentionDaysEdit.value = retentionDays.value;
  archiveEnabled.value = !!data?.archive_enabled;
  archiveAfterDays.value = Number(data?.archive_after_days || 90);
  deleteAfterArchive.value = !!data?.delete_after_archive;
  maxArchiveRows.value = Number(data?.max_archive_rows || 5000);
  warnDbSizeMb.value = Number(data?.warn_db_size_mb || 350);
  warnAuditRows.value = Number(data?.warn_audit_rows || 200000);
  warnAuditBytesMb.value = Number(data?.warn_audit_bytes_mb || 128);
  archiveLast.value = data?.last_archive_at || null;
  auditWarnings.value = Array.isArray(data?.warnings) ? data.warnings : [];
  auditStats.value = {
    total_rows: Number(data?.stats?.total_rows || 0),
    eligible_rows: Number(data?.stats?.eligible_rows || 0),
    approx_audit_mb: Number(data?.stats?.approx_audit_mb || 0),
    db_size_mb: Number(data?.stats?.db_size_mb || 0),
  };
  archiveRuns.value = Array.isArray(data?.archive_runs) ? data.archive_runs : [];
}

async function loadRetention() {
  try {
    const r = await apiGet<any>("/api/admin/audit/retention");
    applyRetentionState((r as any).data || {});
  } catch {
    // ignore (non-admins etc.)
  }
}

async function openRetention() {
  runCleanup.value = false;
  await loadRetention();
  showRetention.value = true;
}

async function saveRetention() {
  try {
    retentionSaving.value = true;
    const payload: any = {
      retention_days: Number(retentionDaysEdit.value || 180),
      archive_enabled: archiveEnabled.value,
      archive_after_days: Number(archiveAfterDays.value || 90),
      delete_after_archive: deleteAfterArchive.value,
      max_archive_rows: Number(maxArchiveRows.value || 5000),
      warn_db_size_mb: Number(warnDbSizeMb.value || 350),
      warn_audit_rows: Number(warnAuditRows.value || 200000),
      warn_audit_bytes_mb: Number(warnAuditBytesMb.value || 128),
    };
    if (runCleanup.value) {
      const { value } = await ElMessageBox.prompt(
        "将删除早于保留天数的审计日志，输入“清理”确认：",
        "确认立即清理",
        { confirmButtonText: "确认", cancelButtonText: "取消", inputPlaceholder: "请输入：清理", inputValue: "" }
      );
      payload.run_cleanup = true;
      payload.confirm = value;
    }
    const r = await apiPost<any>("/api/admin/audit/retention", payload);
    ElMessage.success(runCleanup.value ? "已保存并清理" : "已保存");
    applyRetentionState((r as any).data || payload);
    runCleanup.value = false;
    showRetention.value = false;
  } catch (e: any) {
    if (e === "cancel" || e?.message === "cancel") return;
    ElMessage.error(e?.message || "保存失败");
  } finally {
    retentionSaving.value = false;
  }
}

async function createArchiveJob() {
  try {
    archiveSubmitting.value = true;
    const { value } = await ElMessageBox.prompt(
      "将生成审计归档文件，并根据策略可选删除源记录。输入“归档”确认：",
      "确认创建归档任务",
      { confirmButtonText: "确认", cancelButtonText: "取消", inputPlaceholder: "请输入：归档", inputValue: "" }
    );
    const r = await apiPost<any>("/api/admin/audit/retention", {
      retention_days: Number(retentionDaysEdit.value || 180),
      archive_enabled: archiveEnabled.value,
      archive_after_days: Number(archiveAfterDays.value || 90),
      delete_after_archive: deleteAfterArchive.value,
      max_archive_rows: Number(maxArchiveRows.value || 5000),
      warn_db_size_mb: Number(warnDbSizeMb.value || 350),
      warn_audit_rows: Number(warnAuditRows.value || 200000),
      warn_audit_bytes_mb: Number(warnAuditBytesMb.value || 128),
      run_archive: true,
      archive_confirm: value,
    });
    applyRetentionState((r as any).data || {});
    ElMessage.success(`审计归档任务已创建：#${(r as any).data?.archive_job_id || ''}`);
    showRetention.value = false;
  } catch (e: any) {
    if (e === 'cancel' || e?.message === 'cancel') return;
    ElMessage.error(e?.message || '创建归档任务失败');
  } finally {
    archiveSubmitting.value = false;
  }
}


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

function tryPrettyJson(text: string){
  const t = String(text || "").trim();
  if (!t) return "";
  // Only pretty-print if it's valid JSON
  try{
    const obj = JSON.parse(t);
    return JSON.stringify(obj, null, 2);
  }catch{
    return "";
  }
}

function openPayload(row:any){
  currentPayloadRow.value = row || null;
  rawPayload.value = String(row?.payload_json || "");
  prettyPayload.value = tryPrettyJson(rawPayload.value);
  prettyMode.value = true;
  activePayloadTab.value = payloadDiffEntries.value.length ? 'diff' : 'summary';
  showPayload.value = true;
}

function focusEntityHistory(row: any) {
  if (!row?.entity_id) return;
  entity.value = row.entity || '';
  entityId.value = String(row.entity_id || '');
  page.value = 1;
  showPayload.value = false;
  load();
}

async function copyPayload(){
  const txt = payloadToCopy.value;
  if (!txt) return;
  try{
    await navigator.clipboard.writeText(txt);
    ElMessage.success("已复制");
  }catch{
    // fallback for older browsers / permissions
    const ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    ta.setAttribute("readonly", "true");
    document.body.appendChild(ta);
    ta.select();
    try{
      document.execCommand("copy");
      ElMessage.success("已复制");
    }catch{
      ElMessage.error("复制失败");
    }finally{
      document.body.removeChild(ta);
    }
  }
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
      ElMessage.success('已创建审计导出任务，请前往 系统 > 批量任务中心 下载');
      return;
    }
    const result: any = await fetchAuditExportRows('all');
    await exportAuditRows(result?.data || [], buildAuditExportFilename('all'));
    if (result?.limited) ElMessage.warning(`导出达到上限：${result?.exported || 0} 条`);
  } catch (error: any) {
    ElMessage.error(error?.message || '导出筛选结果失败');
  }
}

async function exportCurrentRows() {
  try {
    if (canAsyncJobManage.value) {
      await createAuditExportJob('current');
      ElMessage.success('已创建当前页审计导出任务，请前往 系统 > 批量任务中心 下载');
      return;
    }
    const result: any = await fetchAuditExportRows('current');
    await exportAuditRows(result?.data || [], buildAuditExportFilename('current'));
  } catch (error: any) {
    ElMessage.error(error?.message || '导出当前页失败');
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
    ElMessage.error(e.message || "加载失败");
  }finally{
    if (currentSeq === loadSeq) loading.value = false;
  }
}

async function hardConfirm(expected: string, title: string) {
  const { value } = await ElMessageBox.prompt(
    `请输入「${expected}」确认操作（区分大小写）`,
    title,
    {
      type: "warning",
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      inputPlaceholder: expected,
      inputValidator: (v: string) => (String(v || "").trim() === expected ? true : `需要输入「${expected}」`),
    }
  );
  return String(value || "").trim();
}

async function deleteOne(id: number){
  try{
    await hardConfirm("删除", "二次确认");
    await apiPost(`/api/audit/delete`, { id, confirm: "删除" });
    ElMessage.success("已删除");
    // if delete makes current page empty, go back one page.
    if (rows.value.length === 1 && page.value > 1) page.value -= 1;
    await load();
  }catch(e:any){
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e.message || "删除失败");
  }
}

async function deleteSelected(){
  const ids = selectedIds.value.slice();
  if (!ids.length) return;
  try{
    await ElMessageBox.confirm(`确认删除选中的 ${ids.length} 条审计日志？`, "删除确认", { type: "warning" });
    await hardConfirm("删除", "二次确认");
    await apiPost(`/api/audit/delete`, { ids, confirm: "删除" });
    ElMessage.success("已删除");
    selectedIds.value = [];
    // adjust page if needed
    if (rows.value.length <= ids.length && page.value > 1) page.value -= 1;
    await load();
  }catch(e:any){
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e.message || "删除失败");
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

.audit-retention-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}
.audit-retention-stats .stats-item{border:1px solid var(--el-border-color);border-radius:var(--radius-md);padding:10px 12px;background:var(--el-fill-color-light)}
.audit-retention-stats .stats-item span{display:block;color:var(--el-text-color-secondary);font-size:12px;margin-bottom:4px}
.audit-retention-stats .stats-item b{font-size:18px}
.archive-history{margin-top:14px}
.archive-history__title{font-weight:700;margin-bottom:8px}
.archive-history__list{display:grid;gap:6px;max-height:160px;overflow:auto}
.archive-history__row{display:grid;grid-template-columns:1.4fr 1.2fr .8fr .8fr 1.6fr;gap:8px;font-size:12px;padding:8px 10px;border:1px solid var(--el-border-color-light);border-radius:var(--radius-sm)}
.audit-page{max-width:1680px;margin:0 auto}
.audit-card{border-radius:var(--radius-md)}
.audit-header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.title{font-weight:800;font-size:16px}
.tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tools :deep(.el-button),.payload-toolbar :deep(.el-button){margin-left:0}
.audit-row-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap;align-content:flex-start}
.audit-row-actions :deep(.el-button){margin-left:0}
.audit-action-btn{width:58px;min-height:28px;padding:0 8px;border-radius:var(--radius-sm);justify-content:center;font-weight:600}
.audit-action-btn--wide{width:98px}
.audit-filters{margin-top:0}
.entity-cell{display:flex;flex-direction:column;gap:2px;line-height:1.15}
.entity-name{font-weight:600}
.entity-meta{font-size:12px;color:var(--subtle)}
.payload-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px}.payload-summary-meta{margin-bottom:14px}.payload-kv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.payload-kv-item{padding:12px;border:1px solid var(--el-border-color);border-radius:var(--radius-md);background:var(--surface-soft)}.payload-kv-label{font-size:12px;color:var(--subtle);margin-bottom:6px}.payload-kv-value{white-space:pre-wrap;word-break:break-word}.payload-diff-list{display:flex;flex-direction:column;gap:12px}.payload-diff-item{padding:12px;border:1px solid var(--el-border-color);border-radius:var(--radius-md);background:var(--surface)}.payload-diff-key{font-weight:700;margin-bottom:10px}.payload-diff-values{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.payload-diff-cell{padding:10px;border-radius:var(--radius-md)}.payload-diff-cell.before{background:var(--warning-tint)}.payload-diff-cell.after{background:var(--success-tint)}.payload-diff-caption{display:inline-block;font-size:12px;color:var(--muted);margin-bottom:6px}.payload-diff-text{white-space:pre-wrap;word-break:break-word}.payload-box{border:1px solid var(--el-border-color);border-radius:var(--radius-md)}.payload-pre{margin:0;padding:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-size:12px;line-height:1.45;white-space:pre-wrap;word-break:break-word}@media (max-width: 900px){.payload-kv-grid,.payload-diff-values{grid-template-columns:1fr}}

@media (max-width: 768px){
  .audit-header,
  .tools,
  .payload-toolbar{
    align-items:stretch;
  }

  .audit-header > *,
  .tools,
  .tools :deep(.el-button),
  .payload-toolbar > *,
  .payload-toolbar :deep(.el-button){
    width:100%;
    max-width:100%;
  }

  .audit-retention-stats{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }

  .archive-history__row{
    grid-template-columns:1fr;
    gap:4px;
  }
}

@media (max-width: 420px){
  .audit-retention-stats{
    grid-template-columns:1fr;
  }
}

</style>
