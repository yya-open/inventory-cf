<template>
  <div class="inventory-summary-row">
    <button type="button" class="summary-card" :class="{ active: inventoryStatus === '' }" @click="emit('select', '')">
      <span class="summary-label">全部设备</span>
      <strong>{{ safeSummary.total }}</strong>
    </button>
    <button type="button" class="summary-card checked" :class="{ active: inventoryStatus === 'CHECKED_OK' }" @click="emit('select', 'CHECKED_OK')">
      <span class="summary-label">已盘</span>
      <strong>{{ safeSummary.checked_ok }}</strong>
    </button>
    <button type="button" class="summary-card issue" :class="{ active: inventoryStatus === 'CHECKED_ISSUE' }" @click="emit('select', 'CHECKED_ISSUE')">
      <span class="summary-label">异常</span>
      <strong>{{ safeSummary.checked_issue }}</strong>
    </button>
    <button type="button" class="summary-card unchecked" :class="{ active: inventoryStatus === 'UNCHECKED' }" @click="emit('select', 'UNCHECKED')">
      <span class="summary-label">未盘</span>
      <strong>{{ safeSummary.unchecked }}</strong>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AssetInventorySummary } from '../../types/assets';

const props = defineProps<{
  inventoryStatus: string;
  summary?: Partial<AssetInventorySummary> | null;
}>();

const emit = defineEmits<{
  select: [string];
}>();

const safeSummary = computed(() => ({
  total: Number(props.summary?.total || 0),
  checked_ok: Number(props.summary?.checked_ok || 0),
  checked_issue: Number(props.summary?.checked_issue || 0),
  unchecked: Number(props.summary?.unchecked || 0),
}));
</script>

<style scoped>
.inventory-summary-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.summary-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: 14px 15px;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 160ms ease, background 160ms ease;
}

.summary-card::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
  background: var(--border-strong);
}

.summary-card.checked::before {
  background: var(--success);
}

.summary-card.issue::before {
  background: var(--danger);
}

.summary-card.unchecked::before {
  background: var(--subtle);
}

.summary-card:hover {
  border-color: var(--border-strong);
}

.summary-card strong {
  font-size: 24px;
  color: var(--ink);
}

.summary-label {
  font-size: 12px;
  color: var(--subtle);
}

.summary-card.active {
  border-color: var(--brand);
  background: var(--brand-tint);
}

.summary-card.checked strong { color: var(--el-color-success); }
.summary-card.issue strong { color: var(--el-color-danger); }
.summary-card.unchecked strong { color: var(--el-color-info); }

@media (max-width: 768px) {
  .inventory-summary-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
