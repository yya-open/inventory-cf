<template>
  <el-card shadow="never" class="pc-toolbar-card ledger-toolbar-card">
    <div class="pc-toolbar">
      <div class="toolbar-left">
        <div class="toolbar-block toolbar-block--filters">
          <div class="toolbar-head toolbar-head--filters">
            <div class="toolbar-title-wrap">
              <div class="toolbar-kicker">PC ASSETS</div>
              <div class="toolbar-block-title">筛选查询</div>
              <div class="toolbar-subtle">按状态、盘点结果或关键词快速定位设备</div>
            </div>
            <el-segmented
              :model-value="archiveMode"
              class="toolbar-archive-mode"
              :options="archiveModeOptions"
              @change="handleArchiveModeChange"
            />
          </div>

          <div class="toolbar-row toolbar-row--dense">
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
              <el-option label="已回收" value="RECYCLED" />
              <el-option label="已报废" value="SCRAPPED" />
            </el-select>
            <el-select
              v-if="hasActiveBatch"
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
            <el-input
              :model-value="keyword"
              clearable
              placeholder="关键词：序列号/品牌/型号/备注"
              class="toolbar-input"
              @update:model-value="emit('update:keyword', $event || '')"
              @keyup.enter="emit('search')"
            />
            <el-select
              v-if="archiveMode !== 'active'"
              :model-value="archiveReason"
              clearable
              filterable
              allow-create
              default-first-option
              placeholder="归档原因"
              class="toolbar-archive-input"
              @update:model-value="emit('update:archive-reason', String($event || ''))"
              @change="emit('search')"
            >
              <el-option v-for="item in archiveReasonOptions" :key="item" :label="item" :value="item" />
            </el-select>
            <div class="toolbar-actions-inline">
              <el-button type="primary" class="toolbar-primary-btn" @click="emit('search')">查询</el-button>
              <el-button class="toolbar-soft-btn" @click="emit('reset')">重置</el-button>
            </div>
          </div>

          <div v-if="hasActiveBatch" class="inventory-summary-row">
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
        <div class="toolbar-block toolbar-block--actions">
          <div class="toolbar-head">
            <div class="toolbar-title-wrap">
              <div class="toolbar-kicker">WORKSPACE</div>
              <div class="toolbar-block-title">快捷工具</div>
              <div class="toolbar-subtle">导出、列管理与批量操作按优先级分层展示</div>
            </div>
            <span class="toolbar-inline-badge" :class="{ 'is-active': selectedCount > 0 }">{{ selectionStateText }}</span>
          </div>

          <div class="toolbar-selection-row">
            <div class="toolbar-action-group">
              <el-dropdown trigger="click" @command="handleBatchCommand">
                <el-button type="primary" class="toolbar-primary-btn" :disabled="selectedCount === 0 || exportBusy || importBusy || initQrBusy || batchBusy">
                  批量操作<el-icon class="el-icon--right"><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="export-qr">导出二维码链接</el-dropdown-item>
                    <el-dropdown-item command="export-qr-cards">导出二维码卡片</el-dropdown-item>
                    <el-dropdown-item command="export-qr-png">导出二维码图版</el-dropdown-item>
                    <el-dropdown-item v-if="isAdmin && showArchived" command="batch-restore">批量恢复归档</el-dropdown-item>
                    <el-dropdown-item v-if="isAdmin" command="batch-status">批量修改状态</el-dropdown-item>
                    <el-dropdown-item v-if="isAdmin" command="batch-owner">批量修改领用人</el-dropdown-item>
                    <el-dropdown-item v-if="isAdmin" command="batch-archive">批量归档</el-dropdown-item>
                    <el-dropdown-item v-if="isAdmin" command="batch-delete" divided>批量删除选中</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>

              <el-button class="toolbar-secondary-btn" :disabled="selectedCount === 0 || exportBusy || importBusy || initQrBusy || batchBusy" @click="emit('export-selected')">
                导出选中
              </el-button>

              <el-button link class="toolbar-link-button" :disabled="selectedCount === 0 || batchBusy" @click="emit('clear-selection')">清空已选</el-button>
            </div>

            <div class="toolbar-spacer" />

            <div class="toolbar-utility-group">
              <el-popover placement="bottom-end" trigger="click" :width="320">
                <template #reference>
                  <el-button class="toolbar-soft-btn">显示列</el-button>
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

              <el-dropdown trigger="click" @command="handleMoreCommand">
                <el-button class="toolbar-soft-btn" :disabled="initQrBusy || batchBusy">
                  更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="export" :disabled="exportBusy || importBusy || initQrBusy || batchBusy">导出Excel</el-dropdown-item>
                    <el-dropdown-item v-if="showArchived" command="export-archive" :disabled="exportBusy || importBusy || initQrBusy || batchBusy">导出归档记录</el-dropdown-item>
                    <el-dropdown-item v-if="isAdmin" command="init-qr" :disabled="initQrBusy || batchBusy">初始化二维码Key</el-dropdown-item>
                    <el-dropdown-item v-if="canOperator" command="download-template" :disabled="importBusy || batchBusy">下载导入模板</el-dropdown-item>
                    <el-dropdown-item v-if="canOperator" command="import" :disabled="importBusy || exportBusy || initQrBusy || batchBusy">Excel导入（批量入库）</el-dropdown-item>
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

const props = defineProps<{
  status: string;
  inventoryStatus: string;
  keyword: string;
  archiveReason: string;
  archiveReasonOptions: string[];
  archiveMode: 'active' | 'archived' | 'all';
  showArchived: boolean;
  isAdmin: boolean;
  canOperator: boolean;
  visibleColumns: string[];
  columnOrder: string[];
  columnOptions: Array<{ value: string; label: string }>;
  selectedCount: number;
  exportBusy: boolean;
  importBusy: boolean;
  initQrBusy: boolean;
  batchBusy: boolean;
  summary: AssetInventorySummary;
  hasActiveBatch: boolean;
}>();

const emit = defineEmits<{
  'update:status': [string];
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
  'batch-owner': [];
  'batch-archive': [];
  'batch-restore': [];
  'clear-selection': [];
  'restore-columns': [];
  'init-qr': [];
  'download-template': [];
  'import-file': [unknown];
}>();

const orderedColumnOptions = computed(() => {
  const map = new Map(props.columnOptions.map((item) => [item.value, item]));
  return props.columnOrder.map((key) => map.get(key)).filter(Boolean) as Array<{ value: string; label: string }>;
});

const orderedVisibleOptions = computed(() => {
  const visibleSet = new Set(props.visibleColumns);
  return orderedColumnOptions.value.filter((item) => visibleSet.has(item.value));
});

const selectionStateText = computed(() => props.selectedCount > 0 ? `已选 ${props.selectedCount} 项` : '未选择设备');
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
  if (value === 'init-qr') return emit('init-qr');
  if (value === 'download-template') return emit('download-template');
  if (value === 'import') return openImportPicker();
}

function handleBatchCommand(command: string | number | object) {
  const value = String(command);
  if (value === 'export-qr') return emit('export-selected-qr');
  if (value === 'export-qr-png') return emit('export-selected-qr-png');
  if (value === 'batch-status') return emit('batch-status');
  if (value === 'batch-owner') return emit('batch-owner');
  if (value === 'batch-archive') return emit('batch-archive');
  if (value === 'batch-restore') return emit('batch-restore');
  if (value === 'export-qr-cards') return emit('export-selected-qr-cards');
  if (value === 'batch-delete') return emit('batch-delete');
}
</script>

<style scoped>
.pc-toolbar,
.monitor-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1.58fr) minmax(340px, 0.98fr);
  gap: 16px;
}

.toolbar-left,
.toolbar-right {
  min-width: 0;
}

:deep(.ledger-toolbar-card > .el-card__body) {
  padding: 0;
}

.toolbar-block {
  position: relative;
  padding: 18px 20px;
  border: 1px solid var(--ledger-border);
  border-radius: 18px;
  background: var(--ledger-surface);
  box-shadow: var(--ledger-shadow-sm);
}

.toolbar-block--filters::before,
.toolbar-block--actions::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  border-radius: 18px 18px 0 0;
  background: linear-gradient(90deg, rgba(22, 119, 255, 0.18), rgba(22, 119, 255, 0.02) 48%, rgba(15, 23, 42, 0));
  pointer-events: none;
}

.toolbar-title-wrap {
  min-width: 0;
}

.toolbar-kicker {
  margin-bottom: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: #94a3b8;
}

.toolbar-block-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--ledger-text-primary);
}

.toolbar-subtle {
  margin-top: 4px;
  color: var(--ledger-text-tertiary);
  font-size: 12px;
  line-height: 1.55;
}

.toolbar-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.toolbar-head--filters {
  align-items: center;
}

.toolbar-inline-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 999px;
  background: var(--ledger-surface-soft);
  color: var(--ledger-text-tertiary);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.toolbar-inline-badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.72;
}

.toolbar-inline-badge.is-active {
  border-color: rgba(22, 119, 255, 0.24);
  background: rgba(22, 119, 255, 0.08);
  color: var(--ledger-primary);
}

.toolbar-row,
.toolbar-selection-row,
.toolbar-action-group,
.toolbar-utility-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.toolbar-row--dense {
  align-items: stretch;
}

.toolbar-action-group,
.toolbar-utility-group {
  position: relative;
  z-index: 1;
  padding: 8px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 14px;
  background: var(--ledger-surface-soft);
}

.toolbar-select,
.toolbar-location {
  width: 150px;
}

.toolbar-input {
  flex: 1 1 280px;
  min-width: 220px;
  max-width: 100%;
}

.toolbar-archive-input {
  width: 170px;
  max-width: 100%;
}

.toolbar-actions-inline {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.toolbar-archive-mode {
  min-width: 220px;
}

.toolbar-link-button {
  padding-left: 2px;
  padding-right: 2px;
  font-weight: 600;
}

.toolbar-create-button {
  margin-left: 0;
}

.toolbar-spacer {
  flex: 1 1 auto;
}

.toolbar-upload-hidden {
  display: none;
}

.toolbar-primary-btn,
.toolbar-secondary-btn,
.toolbar-soft-btn {
  height: 36px;
  border-radius: 10px;
  font-weight: 600;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease, color 160ms ease;
}

.toolbar-primary-btn {
  border: 1px solid var(--ledger-primary);
  background: var(--ledger-primary);
  box-shadow: 0 8px 18px rgba(22, 119, 255, 0.18);
}

.toolbar-primary-btn:hover,
.toolbar-secondary-btn:hover,
.toolbar-soft-btn:hover {
  transform: translateY(-1px);
}

.toolbar-secondary-btn {
  border-color: rgba(148, 163, 184, 0.24);
  background: #fff;
  color: var(--ledger-text-secondary);
  box-shadow: none;
}

.toolbar-secondary-btn:hover {
  border-color: rgba(22, 119, 255, 0.32);
  color: var(--ledger-primary);
  box-shadow: var(--ledger-shadow-sm);
}

.toolbar-soft-btn {
  border-color: rgba(148, 163, 184, 0.2);
  background: var(--ledger-surface-soft);
  color: var(--ledger-text-secondary);
}

.toolbar-soft-btn:hover {
  border-color: rgba(22, 119, 255, 0.22);
  background: #fff;
  color: var(--ledger-primary);
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
  color: var(--ledger-text-secondary);
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
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 12px;
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
  margin-top: 16px;
}

.summary-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: #fff;
  border-radius: 14px;
  padding: 12px 14px;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.03);
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease;
}

.summary-card::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 2px;
  background: rgba(148, 163, 184, 0.42);
}

.summary-card.checked::before {
  background: rgba(21, 128, 61, 0.55);
}

.summary-card.issue::before {
  background: rgba(180, 83, 9, 0.55);
}

.summary-card.unchecked::before {
  background: rgba(71, 85, 105, 0.48);
}

.summary-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--ledger-shadow-sm);
}

.summary-card strong {
  font-size: 22px;
  color: var(--ledger-text-primary);
}

.summary-label {
  font-size: 12px;
  color: var(--ledger-text-tertiary);
}

.summary-card.active {
  border-color: rgba(22, 119, 255, 0.34);
  background: rgba(22, 119, 255, 0.04);
  box-shadow: 0 0 0 1px rgba(22, 119, 255, 0.06), var(--ledger-shadow-sm);
}

.summary-card.checked strong { color: var(--ledger-success); }
.summary-card.issue strong { color: var(--ledger-warning); }
.summary-card.unchecked strong { color: var(--ledger-info); }

:deep(.el-input__wrapper),
:deep(.el-select__wrapper) {
  min-height: 36px;
  border-radius: 10px;
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.2);
  background: #fff;
  transition: box-shadow 160ms ease, background 160ms ease;
}

:deep(.el-input__wrapper.is-focus),
:deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px rgba(22, 119, 255, 0.34), 0 0 0 3px rgba(22, 119, 255, 0.10);
}

:deep(.el-segmented) {
  padding: 3px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 12px;
  background: var(--ledger-surface-soft);
}

:deep(.el-segmented__item) {
  min-height: 32px;
  border-radius: 9px;
  color: var(--ledger-text-secondary);
  font-weight: 600;
}

:deep(.el-segmented__item-selected) {
  border: 1px solid rgba(22, 119, 255, 0.18);
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.04);
}

@media (max-width: 1100px) {
  .pc-toolbar,
  .monitor-toolbar {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .toolbar-block {
    padding: 14px;
    border-radius: 16px;
  }

  .toolbar-head,
  .toolbar-head--filters,
  .toolbar-selection-row {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-inline-badge,
  .toolbar-select,
  .toolbar-location,
  .toolbar-input,
  .toolbar-archive-input,
  .toolbar-archive-mode,
  .toolbar-actions-inline,
  .toolbar-actions-inline :deep(.el-button),
  .toolbar-action-group,
  .toolbar-action-group :deep(.el-button),
  .toolbar-utility-group,
  .toolbar-utility-group :deep(.el-button) {
    width: 100%;
  }

  .toolbar-action-group,
  .toolbar-utility-group {
    align-items: stretch;
  }

  .toolbar-spacer {
    display: none;
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
}
</style>