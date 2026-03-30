<template>
  <el-card shadow="never" class="pc-toolbar-card ledger-toolbar-card">
    <div class="pc-toolbar">
      <div class="toolbar-left">
        <div class="toolbar-block toolbar-block--filters">
          <div class="toolbar-head toolbar-head--filters">
            <div class="toolbar-title-wrap">
              <div class="toolbar-kicker">PC ASSETS</div>
              <div class="toolbar-block-title">筛选查询</div>
              <div class="toolbar-subtle">按状态、盘点结果或关键词快速定位设备，保持列表页高效、稳定、可复用。</div>
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

          <div class="toolbar-feedback-strip">
            <div class="feedback-pill">
              <span class="feedback-pill__label">当前视图</span>
              <strong>{{ activeViewLabel }}</strong>
            </div>
            <div class="feedback-pill">
              <span class="feedback-pill__label">表格密度</span>
              <strong>{{ densityLabel }}</strong>
            </div>
            <div class="feedback-pill" :class="{ 'is-emphasis': selectedCount > 0 }">
              <span class="feedback-pill__label">批量状态</span>
              <strong>{{ selectionStateText }}</strong>
            </div>
          </div>
        </div>
      </div>

      <div class="toolbar-right">
        <div class="toolbar-block toolbar-block--actions">
          <div class="toolbar-head">
            <div class="toolbar-title-wrap">
              <div class="toolbar-kicker">WORKSPACE</div>
              <div class="toolbar-block-title">快捷工具</div>
              <div class="toolbar-subtle">批量操作、导出和表格设置全部前置，低频能力统一收纳到更多菜单。</div>
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
              <el-popover placement="bottom-end" trigger="click" :width="360">
                <template #reference>
                  <el-button class="toolbar-soft-btn">表格设置</el-button>
                </template>
                <div class="column-panel-head">
                  <div class="column-panel-title">表格密度</div>
                  <span class="toolbar-subtle toolbar-inline-tip">自动记住你的偏好</span>
                </div>
                <el-segmented
                  :model-value="density"
                  class="toolbar-density-mode"
                  :options="densityOptions"
                  @change="(value) => emit('update:density', String(value) as 'compact' | 'default' | 'comfortable')"
                />

                <div class="column-panel-title reorder-title">视图方案</div>
                <div class="saved-view-input-row">
                  <el-input v-model="viewDraftName" placeholder="保存当前列设置" maxlength="24" clearable />
                  <el-button type="primary" plain @click="handleSaveView">保存</el-button>
                </div>
                <div class="saved-view-list">
                  <div class="saved-view-item" :class="{ active: activeViewName === 'default' }" role="button" tabindex="0" @click="emit('restore-columns')">
                    <div>
                      <div class="saved-view-name">默认视图</div>
                      <div class="saved-view-meta">默认列顺序 + 标准密度</div>
                    </div>
                    <span class="saved-view-action">恢复</span>
                  </div>
                  <div
                    v-for="item in savedViews"
                    :key="item.name"
                    class="saved-view-item" role="button" tabindex="0"
                    :class="{ active: item.name === activeViewName }"
                    @click="emit('apply-view', item.name)"
                  >
                    <div>
                      <div class="saved-view-name">{{ item.name }}</div>
                      <div class="saved-view-meta">{{ densityText(item.density) }} · {{ item.visibleColumns.length }} 列</div>
                    </div>
                    <span class="saved-view-actions">
                      <span class="saved-view-action">应用</span>
                      <el-button link type="danger" @click.stop="emit('delete-view', item.name)">删除</el-button>
                    </span>
                  </div>
                  <div v-if="!savedViews.length" class="toolbar-subtle">还没有保存的视图，可将常用列布局保存起来反复使用。</div>
                </div>

                <div class="column-panel-head reorder-title">
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
import type { LedgerSavedView, LedgerTableDensity } from '../../utils/ledgerViewPrefs';

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
  density: LedgerTableDensity;
  savedViews: LedgerSavedView[];
  activeViewName: string;
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
  'update:density': [LedgerTableDensity];
  'save-view': [string];
  'apply-view': [string];
  'delete-view': [string];
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
const activeViewLabel = computed(() => props.activeViewName === 'default' ? '默认视图' : props.activeViewName || '默认视图');
const densityLabel = computed(() => densityText(props.density));
const importUploadRef = ref<ComponentPublicInstance | null>(null);
const viewDraftName = ref('');

const archiveModeOptions = [
  { label: '在用', value: 'active' },
  { label: '归档', value: 'archived' },
  { label: '全部', value: 'all' },
];

const densityOptions = [
  { label: '紧凑', value: 'compact' },
  { label: '标准', value: 'default' },
  { label: '宽松', value: 'comfortable' },
];

function openImportPicker() {
  const root = importUploadRef.value?.$el as HTMLElement | undefined;
  const input = root?.querySelector('input[type="file"]') as HTMLInputElement | null;
  input?.click();
}

function densityText(value: LedgerTableDensity) {
  if (value === 'compact') return '紧凑';
  if (value === 'comfortable') return '宽松';
  return '标准';
}

function handleSaveView() {
  const nextName = viewDraftName.value.trim();
  if (!nextName) return;
  emit('save-view', nextName);
  viewDraftName.value = '';
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
  grid-template-columns: minmax(0, 1.58fr) minmax(320px, 0.98fr);
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
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(247, 250, 255, 0.95) 100%);
  box-shadow: 0 24px 50px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(8px);
}

.toolbar-block--filters::before,
.toolbar-block--actions::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: radial-gradient(circle at top right, rgba(64, 158, 255, 0.10), transparent 42%);
}

.toolbar-block--filters::after,
.toolbar-block--actions::after {
  content: '';
  position: absolute;
  left: 20px;
  right: 20px;
  top: 0;
  height: 1px;
  background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.9), rgba(255,255,255,0));
}

.toolbar-title-wrap {
  min-width: 0;
}

.toolbar-kicker {
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: #94a3b8;
}

.toolbar-block-title {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}

.toolbar-subtle {
  margin-top: 4px;
  color: #8a94a6;
  font-size: 12px;
  line-height: 1.55;
}

.toolbar-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.toolbar-head--filters {
  align-items: center;
}

.toolbar-inline-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 13px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.12);
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.74);
}

.toolbar-inline-badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.7;
}

.toolbar-inline-badge.is-active {
  background: rgba(64, 158, 255, 0.14);
  color: var(--el-color-primary-dark-2);
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
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.78);
}

.toolbar-action-group {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 255, 0.90));
}

.toolbar-utility-group {
  background: linear-gradient(180deg, rgba(249, 251, 255, 0.94), rgba(255, 255, 255, 0.88));
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

.toolbar-density-mode {
  width: 100%;
}

.toolbar-inline-tip {
  margin-top: 0;
}

.toolbar-link-button {
  padding-left: 2px;
  padding-right: 2px;
  font-weight: 600;
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
  height: 40px;
  border-radius: 12px;
  font-weight: 700;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease;
}

.toolbar-primary-btn {
  border: none;
  background: linear-gradient(135deg, #409eff 0%, #6ba8ff 100%);
  box-shadow: 0 16px 28px rgba(64, 158, 255, 0.24);
}

.toolbar-primary-btn:hover,
.toolbar-secondary-btn:hover,
.toolbar-soft-btn:hover {
  transform: translateY(-1px);
}

.toolbar-secondary-btn {
  border-color: rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 18px rgba(15, 23, 42, 0.05);
}

.toolbar-secondary-btn:hover {
  border-color: rgba(64, 158, 255, 0.24);
  box-shadow: 0 14px 24px rgba(15, 23, 42, 0.07);
}

.toolbar-soft-btn {
  border-color: rgba(148, 163, 184, 0.18);
  background: rgba(248, 250, 252, 0.96);
  color: #475569;
}

.toolbar-soft-btn:hover {
  border-color: rgba(64, 158, 255, 0.20);
  background: rgba(255, 255, 255, 0.98);
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
  color: #475569;
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
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
}

.column-order-actions {
  display: flex;
  gap: 4px;
}

.saved-view-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.saved-view-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.saved-view-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  text-align: left;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.94);
  cursor: pointer;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.saved-view-item:hover {
  transform: translateY(-1px);
  border-color: rgba(64, 158, 255, 0.28);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.06);
}

.saved-view-item.active {
  border-color: rgba(64, 158, 255, 0.34);
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.08), 0 12px 24px rgba(64, 158, 255, 0.10);
}

.saved-view-name {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
}

.saved-view-meta {
  margin-top: 4px;
  font-size: 12px;
  color: #8a94a6;
}

.saved-view-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.saved-view-action {
  font-size: 12px;
  font-weight: 700;
  color: var(--el-color-primary);
}

.toolbar-feedback-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.feedback-pill {
  min-width: 0;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(255, 255, 255, 0.82);
}

.feedback-pill.is-emphasis {
  border-color: rgba(64, 158, 255, 0.2);
  background: rgba(237, 245, 255, 0.9);
}

.feedback-pill__label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: #8a94a6;
}

.feedback-pill strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #0f172a;
  font-size: 13px;
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

:deep(.el-input__wrapper),
:deep(.el-select__wrapper) {
  min-height: 40px;
  border-radius: 12px;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.94);
  transition: box-shadow 160ms ease, background 160ms ease;
}

:deep(.el-input__wrapper.is-focus),
:deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.34), 0 0 0 4px rgba(64, 158, 255, 0.10);
}

:deep(.el-segmented) {
  padding: 4px;
  border-radius: 14px;
  background: rgba(148, 163, 184, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.76);
}

:deep(.el-segmented__item) {
  min-height: 34px;
  border-radius: 10px;
  color: #475569;
  font-weight: 600;
}

:deep(.el-segmented__item-selected) {
  box-shadow: 0 10px 18px rgba(64, 158, 255, 0.18);
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
    border-radius: 18px;
  }

  .toolbar-head,
  .toolbar-head--filters,
  .toolbar-selection-row,
  .saved-view-input-row {
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
  .toolbar-utility-group :deep(.el-button),
  .saved-view-input-row :deep(.el-button) {
    width: 100%;
  }

  .toolbar-action-group,
  .toolbar-utility-group {
    align-items: stretch;
  }

  .toolbar-spacer {
    display: none;
  }

  .column-check-group,
  .toolbar-feedback-strip {
    grid-template-columns: 1fr;
  }

  .column-order-item,
  .saved-view-item {
    flex-direction: column;
    align-items: stretch;
  }

  .inventory-summary-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
