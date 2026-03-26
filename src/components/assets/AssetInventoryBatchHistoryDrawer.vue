<template>
  <el-drawer :model-value="visible" :title="`${kindLabel}盘点批次历史`" size="520px" @close="emit('update:visible', false)">
    <div class="history-wrap">
      <div class="history-header-card">
        <div class="history-title-row">
          <div>
            <div class="history-title">当前盘点批次</div>
            <div class="history-subtle">仅保留上一轮盘点的开启/结束时间与结果汇总。</div>
          </div>
          <el-tag :type="inventoryBatch.active ? 'success' : 'info'">{{ inventoryBatch.active ? '进行中' : '暂无进行中' }}</el-tag>
        </div>
        <div class="history-name">{{ inventoryBatch.active?.name || inventoryBatch.latest?.name || `暂无${kindLabel}盘点批次` }}</div>
        <div class="history-subtle">
          <template v-if="inventoryBatch.active">开始于 {{ inventoryBatch.active.started_at || '-' }}</template>
          <template v-else-if="inventoryBatch.latest">上一轮结束于 {{ inventoryBatch.latest.closed_at || inventoryBatch.latest.started_at || '-' }}</template>
          <template v-else>建议先开启一轮盘点，再使用扫码页连续执行。</template>
        </div>
        <div class="history-toolbar">
          <el-button type="primary" @click="emit('open-execution')">进入盘点模式</el-button>
          <el-button plain @click="emit('jump-logs')">查看盘点记录</el-button>
        </div>
      </div>

      <div v-if="inventoryBatch.recent?.length" class="history-list">
        <div v-for="item in inventoryBatch.recent" :key="item.id" class="history-item">
          <div class="history-item-head">
            <div>
              <div class="history-item-name">{{ item.name }}</div>
              <div class="history-subtle">创建人：{{ item.created_by || '-' }}<template v-if="item.closed_by"> · 结束人：{{ item.closed_by }}</template></div>
            </div>
            <el-tag :type="item.status === 'ACTIVE' ? 'success' : 'info'">{{ item.status === 'ACTIVE' ? '进行中' : '已结束' }}</el-tag>
          </div>
          <div class="history-time-grid">
            <div>
              <span class="history-label">开始时间</span>
              <strong>{{ item.started_at || '-' }}</strong>
            </div>
            <div>
              <span class="history-label">结束时间</span>
              <strong>{{ item.closed_at || '-' }}</strong>
            </div>
          </div>
          <div class="history-metric-grid">
            <div class="metric-card total">
              <span>总数</span>
              <strong>{{ metricValue(item.summary_total, activeMetricFallback(item, 'summary_total')) }}</strong>
            </div>
            <div class="metric-card checked">
              <span>已盘</span>
              <strong>{{ metricValue(item.summary_checked_ok, activeMetricFallback(item, 'summary_checked_ok')) }}</strong>
            </div>
            <div class="metric-card issue">
              <span>异常</span>
              <strong>{{ metricValue(item.summary_checked_issue, activeMetricFallback(item, 'summary_checked_issue')) }}</strong>
            </div>
            <div class="metric-card unchecked">
              <span>未盘</span>
              <strong>{{ metricValue(item.summary_unchecked, activeMetricFallback(item, 'summary_unchecked')) }}</strong>
            </div>
          </div>
          <div v-if="item.snapshot_filename || item.snapshot_exported_at" class="history-snapshot">
            <span class="history-label">结果快照</span>
            <strong>{{ item.snapshot_filename || '-' }}</strong>
            <div class="history-subtle">导出时间：{{ item.snapshot_exported_at || '-' }}</div>
          </div>
          <div class="history-footnote" v-if="Number(item.summary_total || 0) <= 0 && item.status === 'CLOSED'">
            这轮批次没有保存完整汇总，历史老批次可继续参考开始/结束时间与操作人记录。
          </div>
        </div>
      </div>
      <el-empty v-else description="暂无上一轮盘点历史" />
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import type { InventoryBatchPayload } from '../../api/inventoryBatches';

const props = defineProps<{
  visible: boolean;
  kindLabel: string;
  inventoryBatch: InventoryBatchPayload;
  currentSummary?: { total: number; checked_ok: number; checked_issue: number; unchecked: number };
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  'open-execution': [];
  'jump-logs': [];
}>();

function metricValue(value: number | null | undefined, fallback?: number | null | undefined) {
  const primary = Number(value);
  if (Number.isFinite(primary) && primary > 0) return primary;
  const secondary = Number(fallback);
  return Number.isFinite(secondary) ? secondary : '-';
}

function activeMetricFallback(item: any, key: 'summary_total' | 'summary_checked_ok' | 'summary_checked_issue' | 'summary_unchecked') {
  if (item?.status !== 'ACTIVE' || !props.currentSummary) return null;
  if (key === 'summary_total') return props.currentSummary.total;
  if (key === 'summary_checked_ok') return props.currentSummary.checked_ok;
  if (key === 'summary_checked_issue') return props.currentSummary.checked_issue;
  return props.currentSummary.unchecked;
}
</script>

<style scoped>
.history-wrap { display:flex; flex-direction:column; gap:14px; }
.history-header-card,
.history-item {
  border: 1px solid #ebeef5;
  border-radius: 16px;
  background: linear-gradient(180deg, #fff 0%, #f8fbff 100%);
  padding: 14px 16px;
}
.history-title-row,
.history-item-head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
.history-title { font-size: 14px; font-weight: 700; color:#303133; }
.history-name, .history-item-name { font-size: 16px; font-weight: 700; color:#303133; margin-top: 10px; }
.history-subtle { margin-top: 4px; color:#909399; font-size:12px; line-height:1.6; }
.history-toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-top: 14px; }
.history-list { display:flex; flex-direction:column; gap:12px; }
.history-time-grid,
.history-metric-grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:10px; margin-top: 12px; }
.history-metric-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.history-label { display:block; font-size:12px; color:#909399; margin-bottom:4px; }
.metric-card { border-radius: 12px; padding: 10px 12px; background:#fff; border:1px solid #ebeef5; display:flex; flex-direction:column; gap:6px; }
.metric-card strong { font-size: 20px; color:#303133; }
.metric-card.checked strong { color: var(--el-color-success); }
.metric-card.issue strong { color: var(--el-color-danger); }
.metric-card.unchecked strong { color: var(--el-color-info); }
.history-snapshot { margin-top: 10px; padding: 10px 12px; border-radius: 12px; background: #f8fbff; border: 1px dashed #d7e6ff; display:flex; flex-direction:column; gap:6px; }
.history-footnote { margin-top: 10px; color:#909399; font-size:12px; line-height:1.6; }
@media (max-width: 640px) {
  .history-time-grid,
  .history-metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
