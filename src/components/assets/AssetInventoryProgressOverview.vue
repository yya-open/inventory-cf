<template>
  <div class="progress-card">
    <div class="progress-head">
      <div>
        <div class="progress-title">{{ inventoryBatch.active ? '实时盘点进度' : '上一轮完成情况' }}</div>
        <div class="progress-subtle">{{ progressSubtitle }}</div>
      </div>
      <el-tag :type="inventoryBatch.active ? 'success' : 'info'">{{ inventoryBatch.active ? '进行中' : '最近一轮' }}</el-tag>
    </div>

    <div class="progress-rate-row">
      <div>
        <div class="progress-rate">{{ percentage }}%</div>
        <div class="progress-subtle">完成率（已盘 + 异常）</div>
      </div>
      <div class="progress-count">{{ completedCount }} / {{ resolvedSummary.total || 0 }}</div>
    </div>

    <el-progress :percentage="percentage" :stroke-width="12" :status="progressStatus" />

    <div class="progress-metrics">
      <div class="metric-card total">
        <span>总数</span>
        <strong>{{ resolvedSummary.total || 0 }}</strong>
      </div>
      <div class="metric-card checked">
        <span>已盘</span>
        <strong>{{ resolvedSummary.checked_ok || 0 }}</strong>
      </div>
      <div class="metric-card issue">
        <span>异常</span>
        <strong>{{ resolvedSummary.checked_issue || 0 }}</strong>
      </div>
      <div class="metric-card unchecked">
        <span>未盘</span>
        <strong>{{ resolvedSummary.unchecked || 0 }}</strong>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { InventoryBatchPayload } from '../../api/inventoryBatches';
import type { AssetInventorySummary } from '../../types/assets';

const props = defineProps<{
  kindLabel: string;
  inventoryBatch: InventoryBatchPayload;
  currentSummary: AssetInventorySummary;
}>();

const resolvedSummary = computed<AssetInventorySummary>(() => {
  if (props.inventoryBatch.active) return props.currentSummary;
  const latest = props.inventoryBatch.latest;
  return {
    total: Number(latest?.summary_total || 0),
    checked_ok: Number(latest?.summary_checked_ok || 0),
    checked_issue: Number(latest?.summary_checked_issue || 0),
    unchecked: Number(latest?.summary_unchecked || 0),
  };
});

const completedCount = computed(() => Number(resolvedSummary.value.checked_ok || 0) + Number(resolvedSummary.value.checked_issue || 0));
const percentage = computed(() => {
  const total = Number(resolvedSummary.value.total || 0);
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((completedCount.value / total) * 100)));
});
const progressStatus = computed(() => {
  if (!Number(resolvedSummary.value.total || 0)) return undefined;
  if (Number(resolvedSummary.value.unchecked || 0) === 0) return 'success';
  if (Number(resolvedSummary.value.checked_issue || 0) > 0) return 'warning';
  return undefined;
});
const progressSubtitle = computed(() => {
  if (props.inventoryBatch.active?.name) return `${props.kindLabel}当前批次：${props.inventoryBatch.active.name}`;
  if (props.inventoryBatch.latest?.name) return `${props.kindLabel}上一轮：${props.inventoryBatch.latest.name}`;
  return `暂无${props.kindLabel}盘点批次，开启新一轮后会实时显示完成率。`;
});
</script>

<style scoped>
.progress-card {
  border: 1px solid #ebeef5;
  border-radius: 16px;
  background: linear-gradient(180deg, #fff 0%, #f7fbff 100%);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.progress-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.progress-title { font-size: 14px; font-weight: 700; color: #303133; }
.progress-subtle { margin-top: 4px; color: #909399; font-size: 12px; line-height: 1.6; }
.progress-rate-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-end;
}
.progress-rate { font-size: 30px; font-weight: 800; color: #303133; line-height: 1; }
.progress-count { font-size: 14px; font-weight: 600; color: #606266; }
.progress-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.metric-card {
  border-radius: 12px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #ebeef5;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.metric-card span { font-size: 12px; color: #909399; }
.metric-card strong { font-size: 20px; color: #303133; }
.metric-card.checked strong { color: var(--el-color-success); }
.metric-card.issue strong { color: var(--el-color-warning); }
.metric-card.unchecked strong { color: var(--el-color-info); }
@media (max-width: 768px) {
  .progress-rate-row { align-items: stretch; flex-direction: column; }
}
</style>
