<template>
  <div class="issue-wrap">
    <div class="issue-title-row">
      <div class="issue-title">异常类型分布</div>
      <div class="issue-subtle">把“异常”拆成具体问题，便于复盘处理。</div>
    </div>
    <div class="issue-grid">
      <div v-for="item in items" :key="item.code" class="issue-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { INVENTORY_ISSUE_CODES, emptyInventoryIssueBreakdown, inventoryIssueTypeText, type InventoryIssueBreakdown } from '../../types/assets';

const props = defineProps<{
  breakdown?: Partial<InventoryIssueBreakdown> | null;
}>();

const items = computed(() => {
  const merged = { ...emptyInventoryIssueBreakdown(), ...(props.breakdown || {}) };
  return INVENTORY_ISSUE_CODES.map((code) => ({ code, label: inventoryIssueTypeText(code), value: Number(merged[code] || 0) }));
});
</script>

<style scoped>
.issue-wrap { margin-top: 12px; }
.issue-title-row { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
.issue-title { font-size: 13px; font-weight: 700; color:#606266; }
.issue-subtle { color:#909399; font-size:12px; }
.issue-grid { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:10px; margin-top:10px; }
.issue-card { border:1px solid #ebeef5; background:#fff; border-radius:12px; padding:10px 12px; display:flex; flex-direction:column; gap:6px; }
.issue-card strong { font-size:18px; color:#303133; }
@media (max-width: 640px) { .issue-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
