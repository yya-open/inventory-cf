<template>
  <el-dialog :model-value="visible" :title="`结束${kindLabel}盘点`" width="620px" destroy-on-close @close="emit('update:visible', false)">
    <div class="close-wrap">
      <div class="close-card intro">
        <div class="close-title">结案确认</div>
        <div class="close-name">{{ batch?.name || `当前${kindLabel}盘点批次` }}</div>
        <div class="close-subtle">结束本轮后会在后端异步生成一份结果快照（汇总 / 已盘 / 未盘 / 异常），生成完成后可在“结果快照”中直接下载。</div>
      </div>
      <div class="close-card">
        <div class="close-title">结案预览</div>
        <div class="close-metric-grid">
          <div class="metric-card total">
            <span>总数</span>
            <strong>{{ summary.total }}</strong>
          </div>
          <div class="metric-card checked">
            <span>已盘</span>
            <strong>{{ summary.checked_ok }}</strong>
          </div>
          <div class="metric-card issue">
            <span>异常</span>
            <strong>{{ summary.checked_issue }}</strong>
          </div>
          <div class="metric-card unchecked">
            <span>未盘</span>
            <strong>{{ summary.unchecked }}</strong>
          </div>
        </div>
        <AssetInventoryIssueBreakdownPanel :breakdown="issueBreakdown" />
        <div class="close-subtle">建议先确认异常类型分布是否合理，再执行“结束本轮并生成快照”。</div>
      </div>
    </div>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="loading" @click="emit('confirm')">结束本轮并生成快照</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { InventoryBatchRow } from '../../api/inventoryBatches';
import type { AssetInventorySummary, InventoryIssueBreakdown } from '../../types/assets';
import AssetInventoryIssueBreakdownPanel from './AssetInventoryIssueBreakdownPanel.vue';

defineProps<{
  visible: boolean;
  kindLabel: string;
  batch: InventoryBatchRow | null;
  summary: AssetInventorySummary;
  issueBreakdown: InventoryIssueBreakdown;
  loading: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  confirm: [];
}>();
</script>

<style scoped>
.close-wrap { display:flex; flex-direction:column; gap:14px; }
.close-card { border:1px solid var(--border); border-radius:var(--radius-xl); padding:14px 16px; background:var(--surface); }
.close-title { font-size:14px; font-weight:700; color:var(--ink); }
.close-name { font-size:18px; font-weight:700; color:var(--ink); margin-top:8px; }
.close-subtle { margin-top:8px; color:var(--subtle); font-size:12px; line-height:1.7; }
.close-metric-grid { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:10px; margin-top:12px; }
.metric-card { border-radius: var(--radius-lg); padding: 10px 12px; background:var(--surface); border:1px solid var(--border); display:flex; flex-direction:column; gap:6px; }
.metric-card strong { font-size: 20px; color:var(--ink); }
.metric-card.checked strong { color: var(--el-color-success); }
.metric-card.issue strong { color: var(--el-color-danger); }
.metric-card.unchecked strong { color: var(--el-color-info); }
@media (max-width: 640px) { .close-metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
