<template>
  <div :class="['ledger-table-shell', `ledger-table-shell--${density}`]">
    <LedgerTableSkeleton v-if="initialLoading" :row-count="Math.min(8, Math.max(6, Number(pageSize || 8)))" />
    <el-table v-else
      ref="tableRef"
      class="ledger-table"
      v-loading="loading"
      :data="renderRows"
      row-key="id"
      border
      max-height="calc(100vh - 320px)"
      :row-class-name="rowClassName"
      @selection-change="handleSelectionChange"
      @header-dragend="handleHeaderDragend"
    >
      <el-table-column type="selection" width="48" fixed="left" />
      <el-table-column label="ID" width="80" fixed="left" align="center">
        <template #default="{ $index }">
          {{ (page - 1) * pageSize + $index + 1 }}
        </template>
      </el-table-column>

      <template v-for="key in renderVisibleColumns" :key="key">
        <el-table-column
          v-if="key === 'computer'"
          column-key="computer"
          label="电脑"
          :width="getColumnWidth('computer')"
          :min-width="280"
          fixed="left"
        >
          <template #default="{ row }">
            <div class="table-cell asset-cell" @click="emit('open-info', row)">
              <div class="asset-main ellipsis">{{ [row.brand, row.model].filter(Boolean).join(' · ') || '-' }}</div>
              <div class="asset-meta ellipsis">SN：{{ row.serial_no || '-' }}</div>
              <div v-if="!isLightweightStage && Number(row.archived || 0) === 1" class="asset-tags">
                <el-popover placement="top" trigger="hover" :width="280">
                  <template #reference>
                    <span class="status-chip status-chip--archived status-chip--soft">已归档</span>
                  </template>
                  <div class="archive-detail">
                    <div><b>原因：</b>{{ row.archived_reason || '未填写' }}</div>
                    <div><b>归档人：</b>{{ row.archived_by || '-' }}</div>
                    <div><b>归档时间：</b>{{ row.archived_at || '-' }}</div>
                    <div v-if="row.archived_note"><b>备注：</b>{{ row.archived_note }}</div>
                  </div>
                </el-popover>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column v-else-if="key === 'config'" column-key="config" label="配置" :width="getColumnWidth('config')" :min-width="210">
          <template #default="{ row }">
            <div class="table-cell">
              <div class="cell-primary ellipsis">{{ [row.disk_capacity || '-', row.memory_size || '-'].join(' / ') }}</div>
              <div class="cell-secondary ellipsis">保修至 {{ row.warranty_end || '-' }}</div>
            </div>
          </template>
        </el-table-column>

        <el-table-column v-else-if="key === 'status'" column-key="status" label="状态" :width="getColumnWidth('status', 144)">
          <template #default="{ row }">
            <div class="table-cell status-cell">
              <span class="status-chip" :class="assetStatusClass(row.status)">{{ assetStatusText(row.status) }}</span>
              <el-popover v-if="!isLightweightStage && Number(row.archived || 0) === 1" placement="top" trigger="hover" :width="280">
                <template #reference>
                  <span class="status-chip status-chip--archived status-chip--soft">已归档</span>
                </template>
                <div class="archive-detail">
                  <div><b>原因：</b>{{ row.archived_reason || '未填写' }}</div>
                  <div><b>归档人：</b>{{ row.archived_by || '-' }}</div>
                  <div><b>归档时间：</b>{{ row.archived_at || '-' }}</div>
                  <div v-if="row.archived_note"><b>备注：</b>{{ row.archived_note }}</div>
                </div>
              </el-popover>
            </div>
          </template>
        </el-table-column>

        <el-table-column v-else-if="key === 'inventory'" column-key="inventory" label="盘点状态" :width="getColumnWidth('inventory', 170)">
          <template #default="{ row }">
            <div class="table-cell inventory-cell">
              <span class="status-chip" :class="inventoryStatusClass(row.inventory_status)">{{ inventoryStatusText(row.inventory_status) }}</span>
              <div class="cell-secondary ellipsis">
                <template v-if="String(row.inventory_status || '').toUpperCase() === 'CHECKED_ISSUE'">
                  {{ inventoryIssueTypeText(row.inventory_issue_type) }}
                </template>
                <template v-else-if="String(row.inventory_status || '').toUpperCase() === 'CHECKED_OK'">
                  {{ row.inventory_at || '-' }}
                </template>
                <template v-else>
                  本轮未盘
                </template>
              </div>
              <div v-if="props.showInventoryColumn && recommendedAction(row)" class="inventory-advice ellipsis">{{ recommendedAction(row)?.tip }}</div>
            </div>
          </template>
        </el-table-column>

        <el-table-column v-else-if="key === 'owner'" column-key="owner" label="当前领用人" :width="getColumnWidth('owner')" :min-width="220">
          <template #default="{ row }">
            <div v-if="row.status === 'ASSIGNED'" class="table-cell">
              <div class="cell-primary ellipsis">{{ row.last_employee_name || '-' }}</div>
              <div class="cell-secondary ellipsis">{{ [row.last_employee_no || '-', row.last_department || '-'].join(' · ') }}</div>
            </div>
            <span v-else class="cell-placeholder">-</span>
          </template>
        </el-table-column>

        <el-table-column v-else-if="key === 'configDate'" column-key="configDate" prop="last_config_date" label="配置日期" :width="getColumnWidth('configDate', 130)" />
        <el-table-column v-else-if="key === 'recycleDate'" column-key="recycleDate" prop="last_recycle_date" label="回收日期" :width="getColumnWidth('recycleDate', 130)" />
        <el-table-column v-else-if="key === 'remark'" column-key="remark" prop="remark" label="备注" :width="getColumnWidth('remark')" :min-width="220" show-overflow-tooltip />
      </template>

      <el-table-column v-if="canOperator || isAdmin" label="操作" width="96" align="center" fixed="right">
        <template #default="{ row }">
          <div v-if="Number(row.archived || 0) === 1" class="row-action-wrap">
            <el-dropdown v-if="isAdmin" trigger="click" :disabled="loading" @command="(command: string | number | object) => handleRowMore(String(command), row)">
              <el-button link class="row-more-trigger" :disabled="loading">
                更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="restore">恢复归档</el-dropdown-item>
                  <el-dropdown-item command="delete" divided>彻底删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <span v-else class="cell-secondary">已归档</span>
          </div>
          <div v-else class="row-action-wrap">
            <el-dropdown trigger="click" :disabled="loading" @command="(command: string | number | object) => handleRowMore(String(command), row)">
              <el-button link class="row-more-trigger" :disabled="loading">
                更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="props.showInventoryColumn && recommendedAction(row)" :command="String(recommendedAction(row)?.command || '')">{{ recommendedAction(row)?.label }}</el-dropdown-item>
                  <el-dropdown-item v-if="props.showInventoryColumn && shouldShowLogsShortcut(row)" command="logs">看记录</el-dropdown-item>
                  <el-dropdown-item command="edit">修改</el-dropdown-item>
                  <el-dropdown-item command="qr">二维码</el-dropdown-item>
                  <el-dropdown-item v-if="isAdmin" command="delete" divided>删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>

      <template #empty>
        <el-empty :description="hasFilters ? '暂无匹配结果' : '暂无台账数据'">
          <template #default>
            <div class="empty-wrap">
              <div class="empty-tip">{{ hasFilters ? '可尝试调整筛选条件后重试。' : '当前还没有电脑台账记录。' }}</div>
              <el-button v-if="hasFilters" link type="primary" @click="emit('reset-filters')">清空筛选</el-button>
            </div>
          </template>
        </el-empty>
      </template>
    </el-table>
    <div v-if="isChunking" class="render-hint">大页数据分段渲染中：已加载 {{ renderProgress.visible }}/{{ renderProgress.total }}。为避免 DOM 过多，台账页每页最多 200 条</div>
    <div class="pager-wrap">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        background
        layout="total, sizes, prev, pager, next, jumper"
        :page-sizes="[20, 50, 100, 200]"
        @update:current-page="(value: number) => emit('page-change', value)"
        @update:page-size="(value: number) => emit('page-size-change', value)"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
import { ElDropdown, ElDropdownItem, ElDropdownMenu, ElIcon, ElPopover } from 'element-plus';
import LedgerTableSkeleton from './LedgerTableSkeleton.vue';
import { ArrowDown } from '@element-plus/icons-vue';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useChunkedRows } from '../../composables/useChunkedRows';
import { assetStatusText, inventoryIssueTypeText, inventoryStatusText } from '../../types/assets';
const props = defineProps<{
  rows: Array<Record<string, any>>;
  loading: boolean;
  initialLoading: boolean;
  page: number;
  pageSize: number;
  total: number;
  canOperator: boolean;
  isAdmin: boolean;
  visibleColumns: string[];
  columnWidths: Record<string, number>;
  density: 'compact' | 'default' | 'comfortable';
  selectedIds: string[];
  showInventoryColumn: boolean;
  enableInventoryHighlight: boolean;
  hasFilters: boolean;
  mobileMode?: boolean;
}>();
const emit = defineEmits<{
  'open-info': [Record<string, any>];
  'open-edit': [Record<string, any>];
  'open-qr': [Record<string, any>];
  remove: [Record<string, any>];
  restore: [Record<string, any>];
  'selection-change': [Record<string, any>[]];
  'open-recommended': [string, Record<string, any>];
  'column-resize': [{ key: string; width: number }];
  'page-change': [number];
  'page-size-change': [number];
  'reset-filters': [];
}>();
const orderedVisibleColumns = computed(() => props.showInventoryColumn ? props.visibleColumns : props.visibleColumns.filter((key) => key !== 'inventory'));
const CORE_VISIBLE_KEYS = ['computer', 'status'] as const;
const tableRef = ref<any>();
const mobileMode = computed(() => Boolean(props.mobileMode));
const selectedSet = computed(() => new Set((props.selectedIds || []).map((item) => String(item))));
const syncingSelection = ref(false);
const { renderRows, renderProgress, isChunking } = useChunkedRows(() => props.rows, { threshold: 80, chunkSize: 40 });
const getColumnWidth = (key: string, fallback?: number) => props.columnWidths[key] || fallback;
const isLightweightStage = ref(true);
let revealColumnsTimer: number | null = null;

const renderVisibleColumns = computed(() => {
  if (!isLightweightStage.value) return orderedVisibleColumns.value;
  const core = orderedVisibleColumns.value.filter((key) => CORE_VISIBLE_KEYS.includes(key as any));
  if (core.length) return core;
  return orderedVisibleColumns.value.slice(0, Math.min(2, orderedVisibleColumns.value.length));
});

function clearRevealColumnsTimer() {
  if (revealColumnsTimer != null && typeof window !== 'undefined') {
    window.clearTimeout(revealColumnsTimer);
    revealColumnsTimer = null;
  }
}

function scheduleRevealColumns() {
  if (!isLightweightStage.value || typeof window === 'undefined') return;
  clearRevealColumnsTimer();
  revealColumnsTimer = window.setTimeout(() => {
    revealColumnsTimer = null;
    isLightweightStage.value = false;
  }, 180);
}

function assetStatusClass(status: string) {
  switch (String(status || '')) {
    case 'IN_STOCK':
      return 'status-chip--success';
    case 'ASSIGNED':
      return 'status-chip--warning';
    case 'RECYCLED':
      return 'status-chip--info';
    default:
      return 'status-chip--danger';
  }
}

function inventoryStatusClass(status: string) {
  switch (String(status || '').toUpperCase()) {
    case 'CHECKED_OK':
      return 'status-chip--success';
    case 'CHECKED_ISSUE':
      return 'status-chip--danger';
    default:
      return 'status-chip--info';
  }
}

function rowClassName({ row }: { row: Record<string, any> }) {
  if (!props.enableInventoryHighlight) return '';
  const status = String(row?.inventory_status || '').toUpperCase();
  if (status === 'CHECKED_ISSUE') return 'inventory-row-issue';
  if (status === 'UNCHECKED' || !status) return 'inventory-row-unchecked';
  return '';
}

async function syncSelection() {
  if (!tableRef.value) return;
  syncingSelection.value = true;
  tableRef.value.clearSelection();
  const selectedSet = new Set((props.selectedIds || []).map((item) => String(item)));
  renderRows.value.forEach((row) => {
    if (selectedSet.has(String(row.id))) tableRef.value.toggleRowSelection(row, true);
  });
  await nextTick();
  syncingSelection.value = false;
}

watch(() => [renderRows.value, props.selectedIds], () => {
  nextTick(syncSelection);
}, { deep: true, immediate: true });

watch(() => [props.initialLoading, props.loading, renderRows.value.length, mobileMode.value], ([initialLoading, loading, rowCount, isMobile]) => {
  if (isMobile) {
    isLightweightStage.value = false;
    clearRevealColumnsTimer();
    return;
  }
  if (initialLoading || loading || Number(rowCount || 0) <= 0) {
    isLightweightStage.value = true;
    clearRevealColumnsTimer();
    return;
  }
  scheduleRevealColumns();
}, { immediate: true });

onBeforeUnmount(() => {
  clearRevealColumnsTimer();
});

function handleSelectionChange(value: Record<string, any>[]) {
  if (syncingSelection.value) return;
  emit('selection-change', value);
}

function recommendedAction(row: Record<string, any>) {
  const issue = String(row?.inventory_issue_type || '').toUpperCase();
  if (String(row?.inventory_status || '').toUpperCase() !== 'CHECKED_ISSUE') return null;
  if (issue === 'WRONG_QR') return { label: '重置二维码', command: 'qr', tip: '建议处理：先校正二维码，再重新扫码确认。' };
  if (issue === 'WRONG_STATUS') return { label: '去修改', command: 'edit', tip: '建议处理：核对台账状态或领用信息，再重新盘点。' };
  if (issue === 'WRONG_LOCATION') return { label: '看盘点记录', command: 'logs', tip: '建议处理：先查看异常记录，确认实际摆放位置。' };
  if (issue === 'MISSING' || issue === 'NOT_FOUND') return { label: '去复核', command: 'logs', tip: '建议处理：先复核现场，再决定是否补录异常说明。' };
  return { label: '看盘点记录', command: 'logs', tip: '建议处理：先查看本条盘点异常，再决定后续动作。' };
}

function shouldShowLogsShortcut(row: Record<string, any>) {
  const action = recommendedAction(row);
  return Boolean(action && action.command !== 'logs');
}

function handleRowMore(command: string, row: Record<string, any>) {
  if (command === 'edit') return emit('open-edit', row);
  if (command === 'qr') return emit('open-qr', row);
  if (command === 'delete') return emit('remove', row);
  if (command === 'restore') return emit('restore', row);
  if (command) return emit('open-recommended', command, row);
}

function mobileSequence(index: number) {
  return (Math.max(1, Number(props.page) || 1) - 1) * (Number(props.pageSize) || 0) + index + 1;
}

function mobileInventoryText(row: Record<string, any>) {
  if (String(row.inventory_status || '').toUpperCase() === 'CHECKED_ISSUE') return inventoryIssueTypeText(row.inventory_issue_type);
  if (String(row.inventory_status || '').toUpperCase() === 'CHECKED_OK') return row.inventory_at || '-';
  return '本轮未盘';
}

function toggleMobileSelection(row: Record<string, any>, checked: boolean) {
  const next = new Set(selectedSet.value);
  if (checked) next.add(String(row.id));
  else next.delete(String(row.id));
  emit('selection-change', renderRows.value.filter((item) => next.has(String(item.id))));
}

function handleHeaderDragend(newWidth: number, _oldWidth: number, column: any) {
  const key = String(column?.columnKey || '');
  if (!key) return;
  emit('column-resize', { key, width: Number(newWidth) });
}
</script>
<style scoped>
.render-hint {
  margin-top: 12px;
  padding: 10px 14px;
  color: #64748b;
  font-size: 12px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(248, 250, 255, 0.92), rgba(255, 255, 255, 0.96));
}

.ledger-mobile-list { display: flex; flex-direction: column; gap: 12px; }

.ledger-mobile-loading { padding: 24px 0; text-align: center; color: #64748b; }

.ledger-mobile-card { border-radius: 18px; }

.ledger-mobile-card__head, .ledger-mobile-card__actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ledger-mobile-card__head { margin-bottom: 10px; }
.ledger-mobile-card__select { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #475569; }
.ledger-mobile-card__title { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 6px; }
.ledger-mobile-card__meta { font-size: 12px; color: #64748b; margin-bottom: 8px; }
.ledger-mobile-card__grid { display: grid; gap: 6px; font-size: 13px; color: #334155; margin-bottom: 8px; }
.ledger-mobile-card__grid--muted { color: #64748b; }
.ledger-mobile-card__inventory { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
.ledger-mobile-card__inventory-tip { font-size: 12px; color: #64748b; }
.ledger-mobile-card__actions { justify-content: flex-start; }

.pager-wrap--mobile { justify-content: center; margin-top: 4px; }

.pager-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(226, 232, 240, 0.9);
}

.table-cell {
  min-height: 56px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
}

.asset-cell {
  cursor: pointer;
}

.asset-main,
.cell-primary {
  color: #0f172a;
  font-weight: 600;
  line-height: 1.5;
}

.asset-meta,
.cell-secondary,
.cell-placeholder {
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.asset-tags {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}

.status-cell {
  gap: 7px;
}

.inventory-cell {
  gap: 6px;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 20px;
  border: 1px solid transparent;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.status-chip--success {
  color: #0f8f57;
  background: #ecf8f1;
  border-color: #b7ebd0;
}

.status-chip--warning {
  color: #c06a00;
  background: #fff6e8;
  border-color: #f6d7a6;
}

.status-chip--info {
  color: #516072;
  background: #f4f7fb;
  border-color: #d8e0ea;
}

.status-chip--danger {
  color: #c23d3d;
  background: #fff1f1;
  border-color: #f2b9b9;
}

.status-chip--archived {
  color: #9a6700;
  background: #fff8eb;
  border-color: #f4d39b;
}

.status-chip--soft {
  font-weight: 600;
}

.inventory-advice {
  color: var(--el-color-danger);
  font-size: 12px;
  line-height: 1.45;
}

.row-action-wrap {
  display: flex;
  justify-content: center;
}

.row-more-trigger {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 10px;
  color: #334155;
  background: rgba(248, 250, 252, 0.94);
  border: 1px solid rgba(148, 163, 184, 0.24);
  box-shadow: 0 10px 18px rgba(15, 23, 42, 0.06);
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease;
}

.row-more-trigger:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(64, 158, 255, 0.28);
  box-shadow: 0 14px 24px rgba(15, 23, 42, 0.09);
}

.archive-detail {
  line-height: 1.8;
  font-size: 12px;
  color: #475569;
}

.empty-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-bottom: 4px;
}

.empty-tip {
  color: #64748b;
  font-size: 12px;
  max-width: 320px;
  text-align: center;
}

.ellipsis {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.ledger-table .cell) {
  line-height: 1.45;
}

:deep(.ledger-table .el-table__inner-wrapper) {
  border-radius: 20px;
  overflow: hidden;
}

:deep(.ledger-table .el-table__inner-wrapper::before) {
  height: 0;
}

:deep(.ledger-table__row td) {
  padding-top: 10px;
  padding-bottom: 10px;
  border-bottom-color: rgba(226, 232, 240, 0.88);
}

:deep(.ledger-table__body tr:nth-child(even) > td.el-table__cell) {
  background: rgba(248, 250, 252, 0.56);
}

:deep(.ledger-table__body tr:hover > td.el-table__cell) {
  background: linear-gradient(90deg, rgba(64, 158, 255, 0.08), rgba(255, 255, 255, 0.96)) !important;
}

:deep(.ledger-table__header-wrapper th) {
  background: linear-gradient(180deg, #f8fbff 0%, #f1f5fb 100%);
  color: #475569;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

:deep(.ledger-table__header-wrapper th.el-table__cell.is-leaf) {
  border-bottom-color: rgba(203, 213, 225, 0.8);
}

:deep(.ledger-table .el-table__fixed-right::before),
:deep(.ledger-table .el-table__fixed::before) {
  background-color: rgba(148, 163, 184, 0.16);
}

:deep(.ledger-table .el-table__fixed-right),
:deep(.ledger-table .el-table__fixed) {
  box-shadow: 0 0 0 1px rgba(241, 245, 249, 0.88);
}

:deep(.ledger-table .el-table__empty-block) {
  background: linear-gradient(180deg, rgba(248, 250, 255, 0.74), rgba(255, 255, 255, 0.98));
}

:deep(.ledger-table .el-table__empty-text) {
  padding: 18px 0;
}

:deep(.inventory-row-issue td) {
  background: linear-gradient(90deg, rgba(245, 108, 108, 0.12) 0%, rgba(255, 255, 255, 0) 18%), rgba(245, 108, 108, 0.05);
}

:deep(.inventory-row-issue td:first-child) {
  box-shadow: inset 4px 0 0 rgba(245, 108, 108, 0.85);
}

:deep(.inventory-row-unchecked td) {
  background: linear-gradient(90deg, rgba(148, 163, 184, 0.12) 0%, rgba(255, 255, 255, 0) 18%), rgba(148, 163, 184, 0.04);
}

:deep(.inventory-row-unchecked td:first-child) {
  box-shadow: inset 4px 0 0 rgba(100, 116, 139, 0.72);
}
</style>
