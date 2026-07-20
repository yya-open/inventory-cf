<template>
  <div :class="['ledger-table-shell', `ledger-table-shell--${density}`, { 'ledger-table-shell--mobile': mobileMode }]">
    <LedgerTableSkeleton v-if="initialLoading" :row-count="Math.min(8, Math.max(6, Number(pageSize || 8)))" />
    <div v-if="mobileMode && !initialLoading" class="ledger-mobile-table-hint">
      <span>左右滑动查看完整表格</span>
      <span>每页 {{ pageSize }} 条</span>
    </div>
    <el-table
      v-if="!initialLoading"
      ref="tableRef"
      class="ledger-table"
      v-loading="loading"
      :data="renderRows"
      row-key="id"
      :size="tableSize || undefined"
      border
      :max-height="tableMaxHeight"
      :row-class-name="rowClassNameFn"
      @selection-change="handleSelectionChange"
      @header-dragend="handleHeaderDragend"
    >
      <el-table-column type="selection" width="48" :fixed="tableFixedLeft" />
      <el-table-column :label="sequenceLabel" :width="sequenceWidth" :fixed="tableFixedLeft" align="center">
        <template #default="{ $index }">{{ sequenceNumber($index) }}</template>
      </el-table-column>
      <slot name="columns" :effective-columns="effectiveColumns" :get-column-width="getColumnWidth" :is-lightweight-stage="isLightweightStage" :table-fixed-left="tableFixedLeft" />
      <slot name="action-column" :table-fixed-right="tableFixedRight" :loading="loading" />
      <template #empty>
        <el-empty :description="hasFilters ? '暂无匹配结果' : '暂无台账数据'">
          <template #default>
            <div class="empty-wrap">
              <div class="empty-tip">{{ hasFilters ? '可尝试调整筛选条件后重试。' : emptyDataTip }}</div>
              <el-button v-if="hasFilters" link type="primary" @click="emit('reset-filters')">清空筛选</el-button>
            </div>
          </template>
        </el-empty>
      </template>
    </el-table>
    <div v-if="!initialLoading && loading && renderRows.length" class="ledger-refresh-badge">正在刷新当前列表</div>
    <div v-if="!initialLoading && isChunking" class="render-hint">大页数据分段渲染中：已加载 {{ renderProgress.visible }}/{{ renderProgress.total }}。为避免 DOM 过多，台账页每页最多 200 条</div>
    <div v-if="!initialLoading" class="pager-wrap">
      <el-pagination
        background
        :layout="paginationLayoutValue"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        :page-sizes="[20, 50, 100, 200]"
        @update:page-size="(value: number) => emit('page-size-change', value)"
        @update:current-page="(value: number) => emit('page-change', value)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import LedgerTableSkeleton from './LedgerTableSkeleton.vue';
import { useChunkedRows } from '../../composables/useChunkedRows';
import { inventoryRowClassName } from '../../composables/useAssetTableShared';

const props = withDefaults(defineProps<{
  rows: Array<Record<string, any>>;
  loading: boolean;
  initialLoading: boolean;
  page: number;
  pageSize: number;
  total: number;
  visibleColumns: string[];
  columnWidths: Record<string, number>;
  density: 'compact' | 'default' | 'comfortable';
  selectedIds: string[];
  showInventoryColumn: boolean;
  enableInventoryHighlight: boolean;
  hasFilters: boolean;
  mobileMode?: boolean;
  emptyDataTip?: string;
  sequenceLabel?: string;
  sequenceWidth?: number;
  paginationLayout?: string;
  paginationLayoutMobile?: string;
  useLightweightStage?: boolean;
  coreColumnKeys?: string[];
  tableSize?: 'small' | 'default' | 'large' | '';
}>(), {
  mobileMode: false,
  emptyDataTip: '当前还没有台账记录。',
  sequenceLabel: '序号',
  sequenceWidth: 78,
  paginationLayout: 'total, sizes, prev, pager, next, jumper',
  paginationLayoutMobile: 'total, prev, pager, next',
  useLightweightStage: false,
  coreColumnKeys: () => [],
  tableSize: '',
});

const emit = defineEmits<{
  'selection-change': [Record<string, any>[]];
  'column-resize': [{ key: string; width: number }];
  'page-change': [number];
  'page-size-change': [number];
  'reset-filters': [];
}>();

const tableRef = ref<any>();
const tableFixedLeft = computed<'left' | false>(() => props.mobileMode ? false : 'left');
const tableFixedRight = computed<'right' | false>(() => props.mobileMode ? false : 'right');
const tableMaxHeight = computed(() => props.mobileMode ? 'calc(100vh - 250px)' : 'calc(100vh - 320px)');
const paginationLayoutValue = computed(() => props.mobileMode ? props.paginationLayoutMobile : props.paginationLayout);
const syncingSelection = ref(false);
const { renderRows, renderProgress, isChunking } = useChunkedRows(() => props.rows, { threshold: 80, chunkSize: 40 });

const getColumnWidth = (key: string, fallback?: number) => props.columnWidths[key] || fallback;
const sequenceNumber = (index: number) => (Math.max(1, Number(props.page) || 1) - 1) * (Number(props.pageSize) || 0) + index + 1;

const isLightweightStage = ref(props.useLightweightStage);
let revealColumnsTimer: number | null = null;

const orderedVisibleColumns = computed(() => props.showInventoryColumn ? props.visibleColumns : props.visibleColumns.filter((key) => key !== 'inventory'));

const effectiveColumns = computed(() => {
  if (!props.useLightweightStage || !isLightweightStage.value) return orderedVisibleColumns.value;
  const core = orderedVisibleColumns.value.filter((key) => props.coreColumnKeys.includes(key));
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
  if (!props.useLightweightStage || !isLightweightStage.value || typeof window === 'undefined') return;
  clearRevealColumnsTimer();
  revealColumnsTimer = window.setTimeout(() => {
    revealColumnsTimer = null;
    isLightweightStage.value = false;
  }, 180);
}

const rowClassNameFn = ({ row }: { row: Record<string, any> }) => inventoryRowClassName(row, props.enableInventoryHighlight);

async function syncSelection() {
  if (!tableRef.value) return;
  syncingSelection.value = true;
  tableRef.value.clearSelection();
  const set = new Set((props.selectedIds || []).map((item) => String(item)));
  renderRows.value.forEach((row) => {
    if (set.has(String(row.id))) tableRef.value.toggleRowSelection(row, true);
  });
  await nextTick();
  syncingSelection.value = false;
}

watch(() => [renderRows.value, props.selectedIds], () => {
  nextTick(syncSelection);
}, { deep: true, immediate: true });

watch(() => [props.useLightweightStage, props.initialLoading, props.loading, renderRows.value.length, props.mobileMode], ([useStage, initialLoading, loading, rowCount, isMobile]) => {
  if (!useStage) {
    isLightweightStage.value = false;
    clearRevealColumnsTimer();
    return;
  }
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
  color: var(--muted);
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
}

.ledger-table-shell {
  position: relative;
}

.ledger-mobile-table-hint,
.ledger-refresh-badge {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  padding: 8px 12px;
  border: 1px solid var(--el-color-primary-light-8);
  border-radius: var(--radius-md);
  background: var(--brand-tint);
  color: var(--ink-secondary);
  font-size: 12px;
  font-weight: 600;
}

.ledger-refresh-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 5;
  margin: 0;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.pager-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border-soft);
}

.ledger-table-shell--mobile .pager-wrap {
  justify-content: flex-start;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.empty-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-bottom: 4px;
}

.empty-tip {
  color: var(--muted);
  font-size: 12px;
  max-width: 320px;
  text-align: center;
}

:deep(.ledger-table .cell) {
  line-height: 1.45;
}

:deep(.ledger-table .el-table__inner-wrapper) {
  border-radius: var(--radius-lg);
  overflow: hidden;
}

:deep(.ledger-table .el-table__inner-wrapper::before) {
  height: 0;
}

:deep(.ledger-table__row td) {
  padding-top: 10px;
  padding-bottom: 10px;
  border-bottom-color: var(--border-soft);
}

:deep(.ledger-table__body tr:nth-child(even) > td.el-table__cell) {
  background: var(--surface-soft);
}

:deep(.ledger-table__body tr:hover > td.el-table__cell) {
  background: var(--brand-tint) !important;
}

:deep(.ledger-table__header-wrapper th) {
  background: var(--surface-soft);
  color: var(--ink-secondary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

:deep(.ledger-table__header-wrapper th.el-table__cell.is-leaf) {
  border-bottom-color: var(--border);
}

:deep(.ledger-table .el-table__fixed-right::before),
:deep(.ledger-table .el-table__fixed::before) {
  background-color: var(--border);
}

:deep(.ledger-table .el-table__fixed-right),
:deep(.ledger-table .el-table__fixed) {
  box-shadow: 0 0 0 1px var(--border-soft);
}

:deep(.ledger-table .el-table__empty-block) {
  background: var(--surface);
}

:deep(.ledger-table .el-table__empty-text) {
  padding: 18px 0;
}

:deep(.inventory-row-issue td) {
  background: var(--danger-tint);
}

:deep(.inventory-row-issue td:first-child) {
  box-shadow: inset 3px 0 0 var(--danger);
}

:deep(.inventory-row-unchecked td) {
  background: var(--surface-soft);
}

:deep(.inventory-row-unchecked td:first-child) {
  box-shadow: inset 3px 0 0 var(--subtle);
}
</style>
