<template>
  <el-card shadow="never" class="pc-toolbar-card ledger-toolbar-card">
    <div class="ledger-toolbar-shell">
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

          <LedgerInventorySummaryCards
            v-if="hasActiveBatch"
            :inventory-status="inventoryStatus"
            :summary="summary"
            @select="(value) => emit('set-inventory-filter', value)"
          />
        </div>
      </div>

      <div class="toolbar-right">
        <div class="toolbar-block toolbar-block--actions">
          <div class="toolbar-head">
            <div class="toolbar-title-wrap">
              <div class="toolbar-kicker">WORKSPACE</div>
              <div class="toolbar-block-title">快捷工具</div>
              <div class="toolbar-subtle">批量操作、导出与表格偏好都收进同一工作区，低频能力统一放到更多菜单。</div>
            </div>
            <span class="toolbar-inline-badge" :class="{ 'is-active': selectedCount > 0 }">{{ selectionStateText }}</span>
          </div>

          <div class="toolbar-selection-row">
            <template v-if="bulkWorkspaceMounted">
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
                      <el-dropdown-item v-if="canBulkOperation" command="batch-restore">批量恢复归档</el-dropdown-item>
                      <el-dropdown-item v-if="canBulkOperation" command="batch-status">批量修改状态</el-dropdown-item>
                      <el-dropdown-item v-if="canBulkOperation" command="batch-owner">批量修改领用人</el-dropdown-item>
                      <el-dropdown-item v-if="canBulkOperation" command="batch-archive">批量归档</el-dropdown-item>
                      <el-dropdown-item v-if="canBulkOperation" command="batch-delete" divided>批量删除选中</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>

                <el-button class="toolbar-secondary-btn" :disabled="selectedCount === 0 || exportBusy || importBusy || initQrBusy || batchBusy" @click="emit('export-selected')">
                  导出选中
                </el-button>

                <div class="toolbar-minor-group">
                  <el-button link class="toolbar-link-button" :disabled="selectedCount === 0 || batchBusy" @click="emit('clear-selection')">清空已选</el-button>

                  <el-dropdown trigger="click" @command="handleMoreCommand">
                    <el-button class="toolbar-soft-btn" :disabled="exportBusy || importBusy || initQrBusy || batchBusy">
                      更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="table-settings">表格设置</el-dropdown-item>
                        <el-dropdown-item command="export" :disabled="exportBusy || importBusy || initQrBusy || batchBusy">导出Excel</el-dropdown-item>
                        <el-dropdown-item v-if="showArchived" command="export-archive" :disabled="exportBusy || importBusy || initQrBusy || batchBusy">导出归档记录</el-dropdown-item>
                        <el-dropdown-item command="init-qr" :disabled="initQrBusy || batchBusy">初始化二维码Key</el-dropdown-item>
                        <el-dropdown-item command="download-template" :disabled="importBusy || batchBusy">下载导入模板</el-dropdown-item>
                        <el-dropdown-item command="import" :disabled="importBusy || exportBusy || initQrBusy || batchBusy">Excel导入</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </div>
            </template>
            <div v-else class="toolbar-lazy-actions-placeholder">
              <span class="toolbar-subtle">批量工具默认按需展开，减少首屏渲染与无关交互。</span>
              <el-button class="toolbar-soft-btn" @click="bulkWorkspaceExpanded = true">展开工具</el-button>
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

    <LedgerToolbarSettingsDialog
      v-model:visible="settingsVisible"
      :density="density"
      :saved-views="savedViews"
      :active-view-name="activeViewName"
      :default-view-name="defaultViewName"
      :visible-columns="visibleColumns"
      :column-order="columnOrder"
      :column-options="columnOptions"
      @update:density="emit('update:density', $event)"
      @update:visible-columns="emit('update:visible-columns', $event)"
      @save-view="emit('save-view', $event)"
      @apply-view="emit('apply-view', $event)"
      @delete-view="emit('delete-view', $event)"
      @set-default-view="emit('set-default-view', $event)"
      @restore-columns="emit('restore-columns')"
      @move-column="(name, dir) => emit('move-column', name, dir)"
    />
  </el-card>
</template>

<script setup lang="ts">
import { ElSegmented } from 'element-plus/es/components/segmented/index';
import { ElUpload } from 'element-plus/es/components/upload/index';
import { ElDropdown, ElDropdownItem, ElDropdownMenu } from 'element-plus/es/components/dropdown/index';
import { ElIcon } from 'element-plus/es/components/icon/index';
import { ArrowDown } from '@element-plus/icons-vue';
import LedgerInventorySummaryCards from './LedgerInventorySummaryCards.vue';
import LedgerToolbarSettingsDialog from './LedgerToolbarSettingsDialog.vue';
import { archiveModeOptions, buildArchiveModeChangeHandler, useLedgerToolbarState, type ArchiveMode } from '../../composables/useLedgerToolbarShared';
import type { AssetInventorySummary } from '../../types/assets';
import type { LedgerSavedView, LedgerTableDensity } from '../../utils/ledgerViewPrefs';
import '../../styles/ledger-toolbar-shared.css';

const props = defineProps<{
  status: string;
  inventoryStatus: string;
  keyword: string;
  archiveReason: string;
  archiveReasonOptions: string[];
  archiveMode: ArchiveMode;
  showArchived: boolean;
  isAdmin: boolean;
  canBulkOperation: boolean;
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
  defaultViewName?: string;
  mobileMode?: boolean;
}>();

const emit = defineEmits<{
  'update:status': [string];
  'update:inventory-status': [string];
  'update:keyword': [string];
  'update:archive-reason': [string];
  'update:archive-mode': [ArchiveMode];
  'update:show-archived': [boolean];
  'update:visible-columns': [string[]];
  'move-column': [string, 'up' | 'down'];
  'update:density': [LedgerTableDensity];
  'save-view': [string];
  'apply-view': [string];
  'delete-view': [string];
  'set-default-view': [string];
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

const {
  importUploadRef,
  settingsVisible,
  bulkWorkspaceExpanded,
  selectionStateText,
  bulkWorkspaceMounted,
  openImportPicker,
} = useLedgerToolbarState(
  () => props.selectedCount,
  () => [props.exportBusy, props.importBusy, props.initQrBusy, props.batchBusy],
);

const handleArchiveModeChange = buildArchiveModeChangeHandler(emit);

function handleMoreCommand(command: string | number | object) {
  const value = String(command);
  if (value === 'table-settings') {
    settingsVisible.value = true;
    return;
  }
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
