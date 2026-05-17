<template>
  <div class="inventory-summary-row">
    <button type="button" class="summary-card" :class="{ active: inventoryStatus === '' }" @click="emit('select', '')">
      <span class="summary-label">全部设备</span>
      <strong>{{ summary.total }}</strong>
    </button>
    <button type="button" class="summary-card checked" :class="{ active: inventoryStatus === 'CHECKED_OK' }" @click="emit('select', 'CHECKED_OK')">
      <span class="summary-label">已盘</span>
      <strong>{{ summary.checked_ok }}</strong>
    </button>
    <button type="button" class="summary-card issue" :class="{ active: inventoryStatus === 'CHECKED_ISSUE' }" @click="emit('select', 'CHECKED_ISSUE')">
      <span class="summary-label">异常</span>
      <strong>{{ summary.checked_issue }}</strong>
    </button>
    <button type="button" class="summary-card unchecked" :class="{ active: inventoryStatus === 'UNCHECKED' }" @click="emit('select', 'UNCHECKED')">
      <span class="summary-label">未盘</span>
      <strong>{{ summary.unchecked }}</strong>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { AssetInventorySummary } from '../../types/assets';

defineProps<{
  inventoryStatus: string;
  summary: AssetInventorySummary;
}>();

const emit = defineEmits<{
  select: [string];
}>();
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
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(255, 255, 255, 0.94);
  border-radius: 18px;
  padding: 14px 15px;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 14px 24px rgba(15, 23, 42, 0.05);
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease;
}

.summary-card::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
  background: linear-gradient(90deg, rgba(148, 163, 184, 0.2), rgba(148, 163, 184, 0.7));
}

.summary-card.checked::before {
  background: linear-gradient(90deg, rgba(103, 194, 58, 0.35), rgba(103, 194, 58, 0.86));
}

.summary-card.issue::before {
  background: linear-gradient(90deg, rgba(245, 108, 108, 0.35), rgba(245, 108, 108, 0.86));
}

.summary-card.unchecked::before {
  background: linear-gradient(90deg, rgba(144, 147, 153, 0.35), rgba(144, 147, 153, 0.86));
}

.summary-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 18px 28px rgba(15, 23, 42, 0.08);
}

.summary-card strong {
  font-size: 24px;
  color: #0f172a;
}

.summary-label {
  font-size: 12px;
  color: #8a94a6;
}

.summary-card.active {
  border-color: rgba(64, 158, 255, 0.34);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(237, 245, 255, 0.92));
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.10), 0 20px 32px rgba(64, 158, 255, 0.12);
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
