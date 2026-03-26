<template>
  <el-card shadow="never" class="inventory-batch-page-card">
    <div class="inventory-batch-page-grid">
      <div class="inventory-batch-page-main">
        <AssetInventoryBatchInlinePanel
          :kind-label="kindLabel"
          :inventory-batch="inventoryBatch"
          :current-summary="currentSummary"
          :current-issue-breakdown="currentIssueBreakdown"
        />
      </div>
      <div class="inventory-batch-page-side">
        <AssetInventoryProgressOverview
          :kind-label="kindLabel"
          :inventory-batch="inventoryBatch"
          :current-summary="currentSummary"
        />
        <AssetInventoryBatchActionMenu
          :busy="busy"
          :is-admin="isAdmin"
          :active="Boolean(inventoryBatch.active?.id)"
          @start-batch="emit('start-batch')"
          @close-batch="emit('close-batch')"
          @open-execution="emit('open-execution')"
          @open-history="emit('open-history')"
          @jump-logs="emit('jump-logs')"
        />
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import type { InventoryBatchPayload } from '../../api/inventoryBatches';
import type { AssetInventorySummary, InventoryIssueBreakdown } from '../../types/assets';
import AssetInventoryBatchActionMenu from './AssetInventoryBatchActionMenu.vue';
import AssetInventoryBatchInlinePanel from './AssetInventoryBatchInlinePanel.vue';
import AssetInventoryProgressOverview from './AssetInventoryProgressOverview.vue';

defineProps<{
  kindLabel: string;
  inventoryBatch: InventoryBatchPayload;
  currentSummary: AssetInventorySummary;
  currentIssueBreakdown: InventoryIssueBreakdown;
  busy?: boolean;
  isAdmin?: boolean;
}>();

const emit = defineEmits<{
  'start-batch': [];
  'close-batch': [];
  'open-history': [];
  'open-execution': [];
  'jump-logs': [];
}>();
</script>

<style scoped>
.inventory-batch-page-card { overflow: hidden; }
.inventory-batch-page-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 16px;
  align-items: start;
}
.inventory-batch-page-main,
.inventory-batch-page-side { min-width: 0; }
.inventory-batch-page-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
@media (max-width: 960px) {
  .inventory-batch-page-grid { grid-template-columns: 1fr; }
}
</style>
