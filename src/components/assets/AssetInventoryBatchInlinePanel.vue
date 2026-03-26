<template>
  <div class="batch-inline-wrap">
    <div class="batch-inline-header-card">
      <div class="batch-inline-title-row">
        <div>
          <div class="batch-inline-title">{{ inventoryBatch.active ? '当前盘点批次' : '最近盘点批次' }}</div>
          <div class="batch-inline-subtle">历史数据只保留上一轮，旧批次会在开启新一轮时自动清理。</div>
        </div>
        <el-tag :type="inventoryBatch.active ? 'success' : 'info'">{{ inventoryBatch.active ? '进行中' : '最近一轮' }}</el-tag>
      </div>
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
        <AssetInventoryIssueBreakdownPanel :breakdown="primaryIssueBreakdown" />
      </template>
    </div>

    <div v-if="inventoryBatch.recent?.length" class="batch-inline-list">
      <div v-for="item in inventoryBatch.recent" :key="item.id" class="batch-inline-item">
        <div class="batch-inline-item-head">
          <div>
            <div class="batch-inline-item-name">{{ item.name }}</div>
            <div class="batch-inline-subtle">创建人：{{ item.created_by || '-' }}<template v-if="item.closed_by"> · 结束人：{{ item.closed_by }}</template></div>
          </div>
          <el-tag type="info">上一轮</el-tag>
        </div>
        <div class="batch-inline-time-grid">
          <div>
            <span class="batch-inline-label">开始时间</span>
            <strong>{{ item.started_at || '-' }}</strong>
          </div>
          <div>
            <span class="batch-inline-label">结束时间</span>
            <strong>{{ item.closed_at || '-' }}</strong>
          </div>
        </div>
        <div class="batch-inline-metric-grid">
          <div class="metric-card total">
            <span>总数</span>
            <strong>{{ item.summary_total || 0 }}</strong>
          </div>
          <div class="metric-card checked">
            <span>已盘</span>
            <strong>{{ item.summary_checked_ok || 0 }}</strong>
          </div>
          <div class="metric-card issue">
            <span>异常</span>
            <strong>{{ item.summary_checked_issue || 0 }}</strong>
          </div>
          <div class="metric-card unchecked">
            <span>未盘</span>
            <strong>{{ item.summary_unchecked || 0 }}</strong>
          </div>
        </div>
        <AssetInventoryIssueBreakdownPanel :breakdown="item.summary_issue_breakdown" />
      </div>
    </div>
    <el-empty v-else description="暂无上一轮盘点历史" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { InventoryBatchPayload } from '../../api/inventoryBatches';
import type { AssetInventorySummary, InventoryIssueBreakdown } from '../../types/assets';
import { emptyInventoryIssueBreakdown } from '../../types/assets';
import AssetInventoryIssueBreakdownPanel from './AssetInventoryIssueBreakdownPanel.vue';

const props = defineProps<{
  kindLabel: string;
  inventoryBatch: InventoryBatchPayload;
  currentSummary?: AssetInventorySummary;
  currentIssueBreakdown?: InventoryIssueBreakdown;
}>();

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
</script>

<style scoped>
.batch-inline-wrap { display:flex; flex-direction:column; gap:14px; }
.batch-inline-header-card,
.batch-inline-item {
  border: 1px solid #ebeef5;
  border-radius: 16px;
  background: linear-gradient(180deg, #fff 0%, #f8fbff 100%);
  padding: 14px 16px;
}
.batch-inline-title-row,
.batch-inline-item-head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
.batch-inline-title { font-size: 14px; font-weight: 700; color:#303133; }
.batch-inline-name, .batch-inline-item-name { font-size: 16px; font-weight: 700; color:#303133; margin-top: 10px; }
.batch-inline-subtle { margin-top: 4px; color:#909399; font-size:12px; line-height:1.6; }
.batch-inline-list { display:flex; flex-direction:column; gap:12px; }
.batch-inline-time-grid,
.batch-inline-metric-grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:10px; margin-top: 12px; }
.batch-inline-metric-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.batch-inline-label { display:block; font-size:12px; color:#909399; margin-bottom:4px; }
.metric-card { border-radius: 12px; padding: 10px 12px; background:#fff; border:1px solid #ebeef5; display:flex; flex-direction:column; gap:6px; }
.metric-card strong { font-size: 20px; color:#303133; }
.metric-card.checked strong { color: var(--el-color-success); }
.metric-card.issue strong { color: var(--el-color-danger); }
.metric-card.unchecked strong { color: var(--el-color-info); }
@media (max-width: 640px) {
  .batch-inline-time-grid,
  .batch-inline-metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
