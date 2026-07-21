<template>
  <div class="batch-inline-wrap">
    <div class="batch-inline-shell">
      <div class="batch-inline-shell-head">
        <div>
          <div class="batch-inline-title">{{ inventoryBatch.active ? '当前盘点批次' : '最近盘点批次' }}</div>
          <div class="batch-inline-subtle">这里只保留并展示最近一次盘点结果，开启或结束新一轮后会自动替换。</div>
        </div>
        <div class="batch-inline-shell-actions">
          <el-tag :type="inventoryBatch.active ? 'success' : 'info'">{{ inventoryBatch.active ? '进行中' : '最近一轮' }}</el-tag>
          <el-button text class="batch-collapse-btn" @click="toggleExpanded">{{ expanded ? '收起' : '展开' }}</el-button>
        </div>
      </div>

      <div v-show="expanded" class="batch-inline-shell-body">
        <div class="batch-inline-header-card">
          <div class="batch-inline-name">{{ primaryBatch?.name || `暂无${kindLabel}盘点批次` }}</div>
          <div class="batch-inline-subtle">
            <template v-if="inventoryBatch.active">开始于 {{ inventoryBatch.active.started_at || '-' }}</template>
            <template v-else-if="inventoryBatch.latest">上一轮结束于 {{ inventoryBatch.latest.closed_at || inventoryBatch.latest.started_at || '-' }}</template>
            <template v-else>建议先开启一轮盘点，再使用扫码页连续执行。</template>
          </div>
          <template v-if="primaryBatch">
            <div class="batch-inline-time-grid">
              <div>
                <span class="batch-inline-label">开始时间</span>
                <strong>{{ primaryBatch.started_at || '-' }}</strong>
              </div>
              <div>
                <span class="batch-inline-label">结束时间</span>
                <strong>{{ primaryBatch.closed_at || (inventoryBatch.active ? '进行中' : '-') }}</strong>
              </div>
            </div>
            <div class="batch-inline-metric-grid">
              <div class="metric-card total">
                <span>总数</span>
                <strong>{{ primarySummary.total }}</strong>
              </div>
              <div class="metric-card checked">
                <span>已盘</span>
                <strong>{{ primarySummary.checked_ok }}</strong>
              </div>
              <div class="metric-card issue">
                <span>异常</span>
                <strong>{{ primarySummary.checked_issue }}</strong>
              </div>
              <div class="metric-card unchecked">
                <span>未盘</span>
                <strong>{{ primarySummary.unchecked }}</strong>
              </div>
            </div>
            <AssetInventoryIssueBreakdownPanel
              :breakdown="primaryIssueBreakdown"
              :clickable="interactiveIssueBreakdown"
              :active-code="activeIssueCode"
              @select="(code) => emit('issue-select', code)"
            />
            <div v-if="showSnapshot(primaryBatch)" class="batch-inline-snapshot">
              <div class="batch-inline-snapshot-head">
                <div>
                  <span class="batch-inline-label">结果快照</span>
                  <strong>{{ primaryBatch.snapshot_filename || snapshotStatusText(primaryBatch.snapshot_job_status) }}</strong>
                </div>
                <el-tag :type="snapshotTagType(primaryBatch.snapshot_job_status)">{{ snapshotStatusText(primaryBatch.snapshot_job_status) }}</el-tag>
              </div>
              <div class="batch-inline-subtle">{{ snapshotSubtleText(primaryBatch) }}</div>
              <div class="batch-inline-snapshot-actions">
                <el-button v-if="canDownload(primaryBatch)" type="primary" plain size="small" @click="downloadSnapshot(primaryBatch)">下载快照</el-button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from '../../utils/el-message';
import { apiDownload } from '../../api/client';
import { trackUiEvent } from '../../utils/browserPerf';
import { withExportActionFeedback } from '../../utils/operationFeedback';
import { getInventoryBatchSnapshotDownloadUrl, inventoryBatchSnapshotStatusText, type InventoryBatchPayload, type InventoryBatchRow } from '../../api/inventoryBatches';
import { emptyInventoryIssueBreakdown, type AssetInventorySummary, type InventoryIssueBreakdown } from '../../types/assets';
import AssetInventoryIssueBreakdownPanel from './AssetInventoryIssueBreakdownPanel.vue';

const props = defineProps<{
  kindLabel: string;
  inventoryBatch: InventoryBatchPayload;
  currentSummary?: AssetInventorySummary;
  currentIssueBreakdown?: InventoryIssueBreakdown;
  interactiveIssueBreakdown?: boolean;
  activeIssueCode?: string;
}>();

const emit = defineEmits<{
  'issue-select': [string];
}>();

const expanded = ref(false);

const primaryBatch = computed(() => props.inventoryBatch.active || props.inventoryBatch.latest || null);

const primarySummary = computed(() => {
  if (props.inventoryBatch.active && props.currentSummary) return props.currentSummary;
  return {
    total: Number(primaryBatch.value?.summary_total || 0),
    checked_ok: Number(primaryBatch.value?.summary_checked_ok || 0),
    checked_issue: Number(primaryBatch.value?.summary_checked_issue || 0),
    unchecked: Number(primaryBatch.value?.summary_unchecked || 0),
  };
});

const primaryIssueBreakdown = computed(() => {
  if (props.inventoryBatch.active) return props.currentIssueBreakdown || emptyInventoryIssueBreakdown();
  return primaryBatch.value?.summary_issue_breakdown || emptyInventoryIssueBreakdown();
});

function snapshotStatusText(status: InventoryBatchRow['snapshot_job_status']) {
  return inventoryBatchSnapshotStatusText(status || null);
}

function snapshotTagType(status: InventoryBatchRow['snapshot_job_status']) {
  switch (String(status || '').toLowerCase()) {
    case 'success': return 'success';
    case 'failed': return 'danger';
    case 'canceled': return 'info';
    default: return 'warning';
  }
}

function showSnapshot(item: InventoryBatchRow | null | undefined) {
  return !!(item?.snapshot_job_id || item?.snapshot_filename || item?.snapshot_exported_at || item?.snapshot_job_status || item?.snapshot_error_message);
}

function canDownload(item: InventoryBatchRow | null | undefined) {
  return !!(item?.id && String(item.snapshot_job_status || '').toLowerCase() === 'success');
}

function snapshotSubtleText(item: InventoryBatchRow | null | undefined) {
  if (!item) return '-';
  const jobMeta = item.snapshot_job_meta || null;
  const jobText = item.snapshot_job_id ? `任务 #${item.snapshot_job_id}` : '快照任务';
  const retryText = jobMeta && Number(jobMeta.max_retries || 0) > 0 ? ` · 重试 ${Number(jobMeta.retry_count || 0)}/${Number(jobMeta.max_retries || 0)}` : '';
  const status = String(item.snapshot_job_status || '').toLowerCase();
  if (status === 'success') {
    const fileText = item.snapshot_filename ? ` · 文件：${item.snapshot_filename}` : '';
    const sizeText = item.snapshot_file_size ? ` · 大小：${(Number(item.snapshot_file_size || 0) / 1024).toFixed(1)} KB` : '';
    return `导出时间：${item.snapshot_exported_at || jobMeta?.finished_at || '-'}${fileText}${sizeText} · ${jobText}`;
  }
  if (status === 'failed') return `${item.snapshot_error_message || '结果快照生成失败'} · ${jobText}${retryText}`;
  if (status === 'canceled') return `${item.snapshot_error_message || '结果快照任务已取消'} · ${jobText}`;
  if (status === 'running') return `${jobText} 正在后台生成${jobMeta?.started_at ? ` · 开始于 ${jobMeta.started_at}` : ''}`;
  if (status === 'queued') return `${jobText} 已入队，后台将继续生成${retryText}`;
  return item.snapshot_exported_at ? `导出时间：${item.snapshot_exported_at}` : '结束本轮后会在这里显示可下载的结果快照。';
}

function toggleExpanded() {
  expanded.value = !expanded.value;
  trackUiEvent('inventory_batch_panel_toggle', { metadata: { expanded: expanded.value, kind_label: props.kindLabel } });
}

async function downloadSnapshot(item: InventoryBatchRow) {
  try {
    if (!canDownload(item)) return;
    trackUiEvent('inventory_snapshot_download', {
      metadata: {
        kind: item.kind,
        batch_id: item.id,
        filename: item.snapshot_filename || null,
      },
      urgent: true,
    });
    await withExportActionFeedback('下载盘点快照', () =>
      apiDownload(getInventoryBatchSnapshotDownloadUrl(item.kind, item.id), item.snapshot_filename || undefined)
    );
  } catch (error: any) {
    ElMessage.error(error?.message || '下载结果快照失败');
  }
}
</script>

<style scoped>
.batch-inline-wrap { display:flex; flex-direction:column; gap:14px; }
.batch-inline-shell { border: 1px solid var(--border); border-radius:var(--radius-xl); background: var(--surface); padding: 14px 16px; }
.batch-inline-shell-head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
.batch-inline-shell-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.batch-inline-shell-body { display:flex; flex-direction:column; gap:12px; margin-top: 12px; }
.batch-collapse-btn { padding-inline: 4px; }
.batch-inline-header-card {
  border: 1px solid var(--border);
  border-radius:var(--radius-xl);
  background: var(--surface);
  padding: 14px 16px;
}
.batch-inline-title { font-size: 14px; font-weight: 700; color:var(--ink); }
.batch-inline-name { font-size: 16px; font-weight: 700; color:var(--ink); margin-top: 10px; }
.batch-inline-subtle { margin-top: 4px; color:var(--subtle); font-size:12px; line-height:1.6; }
.batch-inline-snapshot { margin-top: 12px; padding: 10px 12px; border-radius: var(--radius-lg); background: var(--surface-soft); border: 1px dashed var(--el-color-primary-light-8); display:flex; flex-direction:column; gap:6px; }
.batch-inline-snapshot-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
.batch-inline-snapshot-actions { display:flex; justify-content:flex-end; }
.batch-inline-time-grid,
.batch-inline-metric-grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:10px; margin-top: 12px; }
.batch-inline-metric-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.batch-inline-label { display:block; font-size:12px; color:var(--subtle); margin-bottom:4px; }
.metric-card { border-radius: var(--radius-lg); padding: 10px 12px; background:var(--surface); border:1px solid var(--border); display:flex; flex-direction:column; gap:6px; }
.metric-card strong { font-size: 20px; color:var(--ink); }
.metric-card.checked strong { color: var(--el-color-success); }
.metric-card.issue strong { color: var(--el-color-danger); }
.metric-card.unchecked strong { color: var(--el-color-info); }
@media (max-width: 640px) {
  .batch-inline-time-grid,
  .batch-inline-metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .batch-inline-snapshot-head { flex-direction:column; }
}
</style>
