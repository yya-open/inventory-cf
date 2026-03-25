<template>
  <el-card shadow="never" class="monitor-toolbar-card">
    <div class="monitor-toolbar">
      <div class="toolbar-left">
        <div class="toolbar-block">
          <div class="toolbar-block-title">筛选查询</div>
          <div class="toolbar-row">
            <el-select
              :model-value="status"
              placeholder="状态"
              clearable
              class="toolbar-select"
              @update:model-value="emit('update:status', $event || '')"
              @change="emit('search')"
            >
              <el-option label="在库" value="IN_STOCK" />
              <el-option label="已领用" value="ASSIGNED" />
              <el-option label="已回收" value="RETURNED" />
              <el-option label="已调拨" value="TRANSFERRED" />
              <el-option label="已报废" value="SCRAPPED" />
            </el-select>
            <el-select
              :model-value="inventoryStatus"
              placeholder="盘点状态"
              clearable
              class="toolbar-select"
              @update:model-value="emit('update:inventory-status', $event || '')"
              @change="emit('search')"
            >
              <el-option label="已盘" value="CHECKED_OK" />
              <el-option label="异常" value="CHECKED_ISSUE" />
              <el-option label="未盘" value="UNCHECKED" />
            </el-select>
            <el-select
              :model-value="locationId"
              placeholder="位置"
              clearable
              filterable
              class="toolbar-location"
              @update:model-value="emit('update:location-id', $event || '')"
              @change="emit('search')"
              @focus="emit('ensure-location-options')"
              @visible-change="(visible: boolean) => visible && emit('ensure-location-options')"
            >
              <el-option v-for="item in locationOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <el-input
              :model-value="keyword"
              clearable
              placeholder="关键词：资产编号/SN/品牌/型号/领用人"
              class="toolbar-input"
              @update:model-value="emit('update:keyword', $event || '')"
              @keyup.enter="emit('search')"
            />
            <el-input
              v-if="archiveMode !== 'active'"
              :model-value="archiveReason"
              clearable
              placeholder="归档原因"
              class="toolbar-archive-input"
              @update:model-value="emit('update:archive-reason', $event || '')"
              @keyup.enter="emit('search')"
            />
            <el-segmented
              :model-value="archiveMode"
              class="toolbar-archive-mode"
              :options="archiveModeOptions"
              @change="handleArchiveModeChange"
            />
            <div class="toolbar-actions-inline">
              <el-button type="primary" @click="emit('search')">查询</el-button>
              <el-button @click="emit('reset')">重置</el-button>
            </div>
          </div>
          <div class="inventory-summary-row">
            <button type="button" class="summary-card" :class="{ active: inventoryStatus === '' }" @click="emit('set-inventory-filter', '')">
              <span class="summary-label">全部设备</span>
              <strong>{{ summary.total }}</strong>
            </button>
            <button type="button" class="summary-card checked" :class="{ active: inventoryStatus === 'CHECKED_OK' }" @click="emit('set-inventory-filter', 'CHECKED_OK')">
              <span class="summary-label">已盘</span>
              <strong>{{ summary.checked_ok }}</strong>
            </button>
            <button type="button" class="summary-card issue" :class="{ active: inventoryStatus === 'CHECKED_ISSUE' }" @click="emit('set-inventory-filter', 'CHECKED_ISSUE')">
              <span class="summary-label">异常</span>
              <strong>{{ summary.checked_issue }}</strong>
            </button>
            <button type="button" class="summary-card unchecked" :class="{ active: inventoryStatus === 'UNCHECKED' }" @click="emit('set-inventory-filter', 'UNCHECKED')">
              <span class="summary-label">未盘</span>
              <strong>{{ summary.unchecked }}</strong>
            </button>
          </div>
        </div>
      </div>

      <div class="toolbar-right">
        <div class="toolbar-block">
          <div class="toolbar-head">
            <div>
              <div class="toolbar-block-title">快捷工具</div>
              <div class="toolbar-subtle">已选 {{ selectedCount }} 项，支持跨页保留</div>
            </div>
          </div>

          <div class="toolbar-selection-row">
            <el-button :disabled="selectedCount === 0 || exportBusy || importBusy || initQrBusy || batchBusy" @click="emit('export-selected')">
              导出选中
            </el-button>

            <el-dropdown trigger="click" @command="handleBatchCommand">
              <el-button :disabled="selectedCount === 0 || exportBusy || importBusy || initQrBusy || batchBusy">
                批量操作<el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="export-qr">导出二维码链接</el-dropdown-item>
                  <el-dropdown-item command="export-qr-cards">导出二维码卡片</el-dropdown-item>
                  <el-dropdown-item command="export-qr-png">导出二维码图版</el-dropdown-item>
                  <el-dropdown-item v-if="isAdmin && showArchived" command="batch-restore">批量恢复归档</el-dropdown-item>
                  <el-dropdown-item v-if="isAdmin" command="batch-status">批量修改状态</el-dropdown-item>
                  <el-dropdown-item v-if="isAdmin" command="batch-location">批量修改位置</el-dropdown-item>
                  <el-dropdown-item v-if="isAdmin" command="batch-owner">批量修改领用人</el-dropdown-item>
                  <el-dropdown-item v-if="isAdmin" command="batch-archive">批量归档</el-dropdown-item>
                  <el-dropdown-item v-if="isAdmin" command="batch-delete" divided>批量删除选中</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>

            <el-button :disabled="selectedCount === 0 || batchBusy" @click="emit('clear-selection')">清空已选</el-button>

            <div class="toolbar-secondary-actions">
              <el-popover placement="bottom-end" trigger="click" :width="320">
                <template #reference>
                  <el-button>显示列</el-button>
                </template>
                <div class="column-panel-head">
                  <div class="column-panel-title">表格列显示</div>
                  <el-button text type="primary" @click="emit('restore-columns')">恢复默认</el-button>
                </div>
                <el-checkbox-group
                  :model-value="visibleColumns"
                  class="column-check-group"
                  @update:model-value="emit('update:visible-columns', $event as string[])"
                >
                  <el-checkbox v-for="item in orderedColumnOptions" :key="item.value" :value="item.value">{{ item.label }}</el-checkbox>
                </el-checkbox-group>
                <div class="column-panel-title reorder-title">列顺序</div>
                <div v-if="orderedVisibleOptions.length" class="column-order-list">
                  <div v-for="(item, index) in orderedVisibleOptions" :key="item.value" class="column-order-item">
                    <span>{{ index + 1 }}. {{ item.label }}</span>
                    <div class="column-order-actions">
                      <el-button text :disabled="index === 0" @click="emit('move-column', item.value, 'up')">上移</el-button>
                      <el-button text :disabled="index === orderedVisibleOptions.length - 1" @click="emit('move-column', item.value, 'down')">下移</el-button>
                    </div>
                  </div>
                </div>
                <div v-else class="toolbar-subtle">请至少保留一列显示。</div>
              </el-popover>

              <el-button
                v-if="canOperator"
                type="primary"
                plain
                @click="emit('open-create')"
              >
                新增台账
              </el-button>

              <el-dropdown v-if="canOperator || isAdmin" trigger="click" @command="handleMoreCommand">
                <el-button :disabled="initQrBusy || batchBusy">
                  更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="export" :disabled="exportBusy || importBusy || initQrBusy || batchBusy">导出Excel</el-dropdown-item>
                    <el-dropdown-item v-if="showArchived" command="export-archive" :disabled="exportBusy || importBusy || initQrBusy || batchBusy">导出归档记录</el-dropdown-item>
                    <el-dropdown-item v-if="canOperator" command="download-template" :disabled="importBusy || batchBusy">下载导入模板</el-dropdown-item>
                    <el-dropdown-item v-if="canOperator" command="import" :disabled="importBusy || exportBusy || initQrBusy || batchBusy">Excel导入</el-dropdown-item>
                    <el-dropdown-item v-if="canOperator" command="location">管理位置</el-dropdown-item>
                    <el-dropdown-item v-if="isAdmin" command="initQr" :disabled="initQrBusy || batchBusy">初始化二维码Key</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>

            <el-upload
              ref="importUploadRef"
              class="toolbar-upload-hidden"
              :show-file-list="false"
              :auto-upload="false"
              accept=".xlsx,.xls"
              :disabled="importBusy || exportBusy || initQrBusy || batchBusy"
              :on-change="(file: unknown) => emit('import-file', file)"
            />
          </div>
        </div>
        <div class="inventory-batch-row">
          <div class="batch-summary-card" :class="{ active: Boolean(inventoryBatch.active) }">
            <span class="summary-label">当前盘点轮次</span>
            <strong>{{ inventoryBatch.active?.name || inventoryBatch.latest?.name || '未创建盘点批次' }}</strong>
            <div class="toolbar-subtle batch-card-subtle">
              <template v-if="inventoryBatch.active">进行中 · 开始于 {{ inventoryBatch.active.started_at || '-' }}</template>
              <template v-else-if="inventoryBatch.latest">最近一轮已结束 · {{ inventoryBatch.latest.closed_at || inventoryBatch.latest.started_at || '-' }}</template>
              <template v-else>建议先开启一轮盘点，再集中扫码核对。</template>
            </div>
          </div>
          <div v-if="isAdmin" class="inventory-batch-actions">
            <el-button type="primary" plain :disabled="batchBusy" @click="emit('start-batch')">开启新一轮</el-button>
            <el-button v-if="inventoryBatch.active" :disabled="batchBusy" @click="emit('close-batch')">结束本轮</el-button>
          </div>
        </div>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ElSegmented, ElUpload } from 'element-plus';
import { ElDropdown, ElDropdownItem, ElDropdownMenu, ElIcon, ElPopover } from 'element-plus';
import { computed, ref } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { ArrowDown } from '@element-plus/icons-vue';
import type { AssetInventorySummary } from '../../types/assets';
import type { InventoryBatchPayload } from '../../api/inventoryBatches';

const props = defineProps<{
  status: string;
  locationId: string | number;
  inventoryStatus: string;
  keyword: string;
  archiveReason: string;
  archiveReasonOptions: string[];
  archiveMode: 'active' | 'archived' | 'all';
  showArchived: boolean;
  locationOptions: Array<{ value: number; label: string }>;
  canOperator: boolean;
  isAdmin: boolean;
  visibleColumns: string[];
  columnOrder: string[];
  columnOptions: Array<{ value: string; label: string }>;
  selectedCount: number;
  exportBusy: boolean;
  importBusy: boolean;
  initQrBusy: boolean;
  batchBusy: boolean;
  summary: AssetInventorySummary;
  inventoryBatch: InventoryBatchPayload;
}>();

const emit = defineEmits<{
  'update:status': [string];
  'update:location-id': [string | number];
  'update:inventory-status': [string];
  'update:keyword': [string];
  'update:archive-reason': [string];
  'update:archive-mode': ['active' | 'archived' | 'all'];
  'update:show-archived': [boolean];
  'update:visible-columns': [string[]];
  'move-column': [string, 'up' | 'down'];
  search: [];
  reset: [];
  'set-inventory-filter': [string];
  export: [];
  'export-archive': [];
  'export-selected': [];
  'export-selected-qr': [];
  'export-selected-qr-cards': [];
  'export-selected-qr-png': [];
  'batch-delete': [];
  'batch-status': [];
  'batch-location': [];
  'batch-owner': [];
  'batch-archive': [];
  'batch-restore': [];
  'clear-selection': [];
  'restore-columns': [];
  'ensure-location-options': [];
  'download-template': [];
  'start-batch': [];
  'close-batch': [];
  'import-file': [unknown];
  'open-create': [];
  'toolbar-more': [string];
}>();

const orderedColumnOptions = computed(() => {
  const map = new Map(props.columnOptions.map((item) => [item.value, item]));
  return props.columnOrder.map((key) => map.get(key)).filter(Boolean) as Array<{ value: string; label: string }>;
});

const orderedVisibleOptions = computed(() => {
  const visibleSet = new Set(props.visibleColumns);
  return orderedColumnOptions.value.filter((item) => visibleSet.has(item.value));
});

const importUploadRef = ref<ComponentPublicInstance | null>(null);

const archiveModeOptions = [
  { label: '在用', value: 'active' },
  { label: '归档', value: 'archived' },
  { label: '全部', value: 'all' },
];

function openImportPicker() {
  const root = importUploadRef.value?.$el as HTMLElement | undefined;
  const input = root?.querySelector('input[type="file"]') as HTMLInputElement | null;
  input?.click();
}

function handleArchiveModeChange(value: string | number | boolean) {
  const mode = (String(value || 'active') as 'active' | 'archived' | 'all');
  emit('update:archive-mode', mode);
  emit('update:show-archived', mode !== 'active');
  emit('search');
}

function handleMoreCommand(command: string | number | object) {
  const value = String(command);
  if (value === 'export') return emit('export');
  if (value === 'export-archive') return emit('export-archive');
  if (value === 'download-template') return emit('download-template');
  if (value === 'import') return openImportPicker();
  emit('toolbar-more', value);
}

function handleBatchCommand(command: string | number | object) {
  const value = String(command);
  if (value === 'export-qr') return emit('export-selected-qr');
  if (value === 'export-qr-png') return emit('export-selected-qr-png');
  if (value === 'batch-status') return emit('batch-status');
  if (value === 'batch-location') return emit('batch-location');
  if (value === 'batch-owner') return emit('batch-owner');
  if (value === 'batch-archive') return emit('batch-archive');
  if (value === 'batch-restore') return emit('batch-restore');
  if (value === 'export-qr-cards') return emit('export-selected-qr-cards');
  if (value === 'batch-delete') return emit('batch-delete');
}
</script>

<style scoped>
.monitor-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.95fr);
  gap: 16px;
}
.toolbar-left,
.toolbar-right {
  min-width: 0;
}
.toolbar-block {
  padding: 14px 16px;
  border: 1px solid #ebeef5;
  border-radius: 16px;
  background: linear-gradient(180deg, #fff 0%, #fafcff 100%);
}
.toolbar-block-title {
  font-size: 13px;
  font-weight: 700;
  color: #606266;
}
.toolbar-subtle {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
}
.toolbar-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.toolbar-row,
.toolbar-selection-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.toolbar-select,
.toolbar-location {
  width: 160px;
}
.toolbar-input {
  width: 300px;
  max-width: 100%;
}
.toolbar-archive-input {
  width: 180px;
  max-width: 100%;
}
.toolbar-actions-inline {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.toolbar-secondary-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  flex-basis: 100%;
  width: 100%;
  justify-content: flex-start;
  align-items: center;
}
.toolbar-archive-mode {
  min-width: 240px;
}
.toolbar-upload-hidden {
  display: none;
}
.column-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.column-panel-title {
  font-size: 13px;
  font-weight: 700;
  color: #606266;
  margin-bottom: 8px;
}
.reorder-title {
  margin-top: 12px;
}
.column-check-group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
}
.column-order-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.column-order-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  background: #fff;
}
.column-order-actions {
  display: flex;
  gap: 4px;
}
.inventory-summary-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}
.summary-card {
  border: 1px solid #ebeef5;
  background: #fff;
  border-radius: 14px;
  padding: 12px 14px;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.summary-card strong {
  font-size: 22px;
  color: #303133;
}
.summary-label {
  font-size: 12px;
  color: #909399;
}
.summary-card.active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.15);
}
.summary-card.checked strong { color: var(--el-color-success); }
.summary-card.issue strong { color: var(--el-color-danger); }
.summary-card.unchecked strong { color: var(--el-color-info); }
.inventory-batch-row { display:flex; align-items:stretch; gap:12px; margin-top: 12px; flex-wrap: wrap; }
.batch-summary-card { flex:1; min-width: 260px; border: 1px solid #ebeef5; background: linear-gradient(180deg, #fff 0%, #f7fbff 100%); border-radius: 14px; padding: 12px 14px; display:flex; flex-direction:column; gap:6px; }
.batch-summary-card.active { border-color: var(--el-color-primary); box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.18); }
.batch-card-subtle { margin-top: 0; }
.inventory-batch-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
@media (max-width: 1100px) {
  .monitor-toolbar {
    grid-template-columns: 1fr;
  }
  .toolbar-secondary-actions {
    justify-content: flex-start;
  }
}
@media (max-width: 768px) {
  .toolbar-block {
    padding: 12px;
    border-radius: 14px;
  }
  .toolbar-head {
    flex-direction: column;
    align-items: stretch;
  }
  .toolbar-select,
  .toolbar-location,
  .toolbar-input,
  .toolbar-archive-mode,
  .toolbar-actions-inline,
  .toolbar-actions-inline :deep(.el-button),
  .toolbar-selection-row,
  .toolbar-selection-row :deep(.el-button),
  .toolbar-secondary-actions,
  .toolbar-secondary-actions :deep(.el-button) {
    width: 100%;
  }
  .toolbar-secondary-actions {
    justify-content: flex-start;
  }
  .column-check-group {
    grid-template-columns: 1fr;
  }
  .column-order-item {
    flex-direction: column;
    align-items: stretch;
  }
  .inventory-summary-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .inventory-batch-row {
    flex-direction: column;
  }
}
</style>
