<template>
  <div :class="['ledger-table-shell', `ledger-table-shell--${density}`]">
    <div v-if="loading && !rows.length" class="ledger-table-skeleton">
      <el-skeleton :rows="8" animated />
    </div>
    <el-card v-else shadow="never" class="ledger-table-card">
      <el-table
      ref="tableRef"
      class="ledger-table"
      v-loading="loading"
      :data="renderRows"
      row-key="id"
      size="small"
      border
      max-height="calc(100vh - 320px)"
      :row-class-name="rowClassName"
      @selection-change="handleSelectionChange"
      @header-dragend="handleHeaderDragend"
    >
      <el-table-column type="selection" width="48" fixed="left" />
      <el-table-column label="序号" width="78" fixed="left" align="center">
        <template #default="{ $index }">{{ sequenceNumber($index) }}</template>
      </el-table-column>

      <template v-for="key in orderedVisibleColumns" :key="key">
        <el-table-column v-if="key === 'assetCode'" column-key="assetCode" label="资产编号" :width="getColumnWidth('assetCode')" :min-width="170" fixed="left">
          <template #default="{ row }">
            <div class="table-cell asset-cell" @click="emit('open-info', row)">
              <div class="cell-primary ellipsis">{{ row.asset_code || '-' }}</div>
              <div class="cell-secondary ellipsis">{{ [row.brand, row.size_inch ? `${row.size_inch} 寸` : ''].filter(Boolean).join(' · ') || '显示器资产' }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-else-if="key === 'serialNo'" column-key="serialNo" prop="sn" label="SN" :width="getColumnWidth('serialNo')" :min-width="150" show-overflow-tooltip />

        <el-table-column v-else-if="key === 'brand'" column-key="brand" prop="brand" label="品牌" :width="getColumnWidth('brand', 120)" :min-width="120" show-overflow-tooltip />
        <el-table-column v-else-if="key === 'model'" column-key="model" label="型号" :width="getColumnWidth('model')" :min-width="220">
          <template #default="{ row }">
            <div class="table-cell asset-cell" @click="emit('open-info', row)">
              <div class="cell-primary ellipsis">{{ row.model || '-' }}</div>
              <div class="cell-secondary ellipsis">{{ [row.brand || '-', row.size_inch ? `${row.size_inch} 寸` : '-', `SN ${row.sn || '-'}`].join(' · ') }}</div>
              <div v-if="Number(row.archived || 0) === 1" class="asset-tags">
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
        <el-table-column v-else-if="key === 'sizeInch'" column-key="sizeInch" prop="size_inch" label="尺寸" :width="getColumnWidth('sizeInch', 90)" />
        <el-table-column v-else-if="key === 'status'" column-key="status" label="状态" :width="getColumnWidth('status', 132)">
          <template #default="{ row }">
            <div class="table-cell status-cell">
              <span class="status-chip" :class="assetStatusClass(row.status)">{{ statusText(row.status) }}</span>
              <el-popover v-if="Number(row.archived || 0) === 1" placement="top" trigger="hover" :width="280">
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
              <div v-if="props.showInventoryColumn && recommendedAction(row)" class="inventory-advice">{{ recommendedAction(row)?.tip }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-else-if="key === 'location'" column-key="location" label="位置" :width="getColumnWidth('location')" :min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="table-cell compact-cell">
              <div class="cell-primary ellipsis">{{ locationText(row) }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-else-if="key === 'owner'" column-key="owner" label="领用人" :width="getColumnWidth('owner')" :min-width="190">
          <template #default="{ row }">
            <div v-if="row.employee_no || row.employee_name || row.department" class="table-cell">
              <div class="cell-primary ellipsis">{{ row.employee_name || '-' }}</div>
              <div class="cell-secondary ellipsis">{{ [row.employee_no || '-', row.department || '-'].join(' · ') }}</div>
            </div>
            <span v-else class="cell-placeholder">-</span>
          </template>
        </el-table-column>
        <el-table-column v-else-if="key === 'department'" column-key="department" prop="department" label="部门" :width="getColumnWidth('department')" :min-width="140" show-overflow-tooltip />
        <el-table-column v-else-if="key === 'remark'" column-key="remark" prop="remark" label="备注" :width="getColumnWidth('remark', 180)" :min-width="180" show-overflow-tooltip />
        <el-table-column v-else-if="key === 'archiveReason'" column-key="archiveReason" prop="archived_reason" label="归档原因" :width="getColumnWidth('archiveReason', 160)" :min-width="160" show-overflow-tooltip />
        <el-table-column v-else-if="key === 'updatedAt'" column-key="updatedAt" prop="updated_at" label="更新时间" :width="getColumnWidth('updatedAt')" :min-width="170" />
      </template>

      <el-table-column label="操作" width="96" align="center" fixed="right">
        <template #default="{ row }">
          <div v-if="Number(row.archived || 0) === 1" class="row-action-wrap">
            <el-dropdown v-if="isAdmin" trigger="click" :disabled="loading" @command="(command: string | number | object) => emit('row-more', String(command), row)">
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
            <el-dropdown v-if="canOperator || isAdmin" trigger="click" :disabled="loading" @command="(command: string | number | object) => emit('row-more', String(command), row)">
              <el-button link class="row-more-trigger" :disabled="loading">
                更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="props.showInventoryColumn && recommendedAction(row)" :command="String(recommendedAction(row)?.command || '')">{{ recommendedAction(row)?.label }}</el-dropdown-item>
                  <el-dropdown-item v-if="props.showInventoryColumn && shouldShowLogsShortcut(row)" command="logs">看记录</el-dropdown-item>
                  <el-dropdown-item v-if="canOperator" command="in">入库</el-dropdown-item>
                  <el-dropdown-item v-if="canOperator" command="out">出库</el-dropdown-item>
                  <el-dropdown-item v-if="isAdmin" command="edit">修改</el-dropdown-item>
                  <el-dropdown-item v-if="canOperator" command="qr">二维码</el-dropdown-item>
                  <el-dropdown-item command="audit">审计历史</el-dropdown-item>
                  <el-dropdown-item v-if="canOperator" command="return">归还</el-dropdown-item>
                  <el-dropdown-item v-if="canOperator" command="transfer">调拨</el-dropdown-item>
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
              <div class="empty-tip">{{ hasFilters ? '可尝试调整筛选条件后重试。' : '当前还没有显示器台账记录。' }}</div>
              <el-button v-if="hasFilters" link type="primary" @click="emit('reset-filters')">清空筛选</el-button>
            </div>
          </template>
        </el-empty>
      </template>
    </el-table>
    <div v-if="isChunking" class="render-hint">大页数据分段渲染中：已加载 {{ renderProgress.visible }}/{{ renderProgress.total }}。为避免 DOM 过多，台账页每页最多 200 条</div>
    <div class="pager-wrap">
      <el-pagination
        background
        layout="total, sizes, prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        :page-sizes="[20, 50, 100, 200]"
        @update:page-size="(value: number) => emit('size-change', value)"
        @update:current-page="(value: number) => emit('page-change', value)"
      />
    </div>
  </el-card>
  </div>
</template>
<script setup lang="ts">
import { ElDropdown, ElDropdownItem, ElDropdownMenu, ElIcon, ElPopover } from 'element-plus';
import { computed, nextTick, ref, watch } from 'vue';
import { useChunkedRows } from '../../composables/useChunkedRows';
import { ArrowDown } from '@element-plus/icons-vue';
import { inventoryIssueTypeText, inventoryStatusText } from '../../types/assets';
const props = defineProps<{
  rows: Array<Record<string, any>>;
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  canOperator: boolean;
  isAdmin: boolean;
  visibleColumns: string[];
  columnWidths: Record<string, number>;
  density: 'compact' | 'default' | 'comfortable';
  selectedIds: string[];
  showInventoryColumn: boolean;
  enableInventoryHighlight: boolean;
  statusText: (status: string) => string;
  locationText: (row: Record<string, any>) => string;
  hasFilters: boolean;
}>();
const emit = defineEmits<{
  'open-info': [Record<string, any>];
  in: [Record<string, any>];
  out: [Record<string, any>];
  remove: [Record<string, any>];
  restore: [Record<string, any>];
  'row-more': [string, Record<string, any>];
  'selection-change': [Record<string, any>[]];
  'open-recommended': [string, Record<string, any>];
  'column-resize': [{ key: string; width: number }];
  'page-change': [number];
  'size-change': [number];
  'reset-filters': [];
}>();
const orderedVisibleColumns = computed(() => props.showInventoryColumn ? props.visibleColumns : props.visibleColumns.filter((key) => key !== 'inventory'));
const tableRef = ref<any>();
const syncingSelection = ref(false);
const { renderRows, renderProgress, isChunking } = useChunkedRows(() => props.rows, { threshold: 80, chunkSize: 40 });
const getColumnWidth = (key: string, fallback?: number) => props.columnWidths[key] || fallback;
const sequenceNumber = (index: number) => (Math.max(1, Number(props.page) || 1) - 1) * (Number(props.pageSize) || 0) + index + 1;

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
function handleSelectionChange(value: Record<string, any>[]) {
  if (syncingSelection.value) return;
  emit('selection-change', value);
}

function recommendedAction(row: Record<string, any>) {
  const issue = String(row?.inventory_issue_type || '').toUpperCase();
  if (String(row?.inventory_status || '').toUpperCase() !== 'CHECKED_ISSUE') return null;
  if (issue === 'WRONG_LOCATION') return { label: '去调拨', command: 'transfer', tip: '建议处理：确认实物所在位置后，直接做调拨修正。' };
  if (issue === 'WRONG_STATUS') return { label: '去归还', command: 'return', tip: '建议处理：核对领用/归还状态后，再重新盘点。' };
  if (issue === 'WRONG_QR') return { label: '重置二维码', command: 'qr', tip: '建议处理：先更新二维码，再重新扫码确认。' };
  if (issue === 'MISSING' || issue === 'NOT_FOUND') return { label: '去复核', command: 'logs', tip: '建议处理：先查看异常记录并现场复核，再决定是否补充备注。' };
  return { label: '看盘点记录', command: 'logs', tip: '建议处理：先查看本条盘点异常，再决定后续动作。' };
}

function shouldShowLogsShortcut(row: Record<string, any>) {
  const action = recommendedAction(row);
  return Boolean(action && action.command !== 'logs');
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

.pager-wrap {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  padding-top: 14px;
  border-top: 1px solid rgba(226, 232, 240, 0.9);
}

.table-cell {
  min-height: 54px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
}

.compact-cell {
  min-height: 44px;
}

.asset-cell {
  cursor: pointer;
}

.cell-primary {
  color: #0f172a;
  font-weight: 600;
  line-height: 1.5;
}

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

:deep(.ledger-table-card > .el-card__body) {
  padding: 18px;
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
