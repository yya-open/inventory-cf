<template>
  <el-card shadow="never">
    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="renderRows"
      row-key="id"
      size="small"
      border
      :row-class-name="rowClassName"
      @selection-change="handleSelectionChange"
      @header-dragend="handleHeaderDragend"
    >
      <el-table-column type="selection" width="48" fixed="left" />
      <el-table-column label="序号" width="78" fixed="left" align="center">
        <template #default="{ $index }">{{ sequenceNumber($index) }}</template>
      </el-table-column>

      <template v-for="key in orderedVisibleColumns" :key="key">
        <el-table-column v-if="key === 'assetCode'" column-key="assetCode" label="资产编号" :width="getColumnWidth('assetCode')" :min-width="160" fixed="left">
          <template #default="{ row }">
            <div class="asset-link strong" @click="emit('open-info', row)">{{ row.asset_code || '-' }}</div>
          </template>
        </el-table-column>
        <el-table-column v-else-if="key === 'serialNo'" column-key="serialNo" prop="sn" label="SN" :width="getColumnWidth('serialNo')" :min-width="140" />

        <el-table-column v-else-if="key === 'brand'" column-key="brand" prop="brand" label="品牌" :width="getColumnWidth('brand', 120)" :min-width="120" />
        <el-table-column v-else-if="key === 'model'" column-key="model" label="型号" :width="getColumnWidth('model')" :min-width="200">
          <template #default="{ row }">
            <span>{{ [row.brand, row.model].filter(Boolean).join(' ') }}</span>
            <el-popover v-if="Number(row.archived || 0) === 1" placement="top" trigger="hover" :width="280">
              <template #reference>
                <el-tag size="small" type="warning" effect="plain" class="archive-tag">已归档</el-tag>
              </template>
              <div class="archive-detail">
                <div><b>原因：</b>{{ row.archived_reason || '未填写' }}</div>
                <div><b>归档人：</b>{{ row.archived_by || '-' }}</div>
                <div><b>归档时间：</b>{{ row.archived_at || '-' }}</div>
                <div v-if="row.archived_note"><b>备注：</b>{{ row.archived_note }}</div>
              </div>
            </el-popover>
          </template>
        </el-table-column>
        <el-table-column v-else-if="key === 'sizeInch'" column-key="sizeInch" prop="size_inch" label="尺寸" :width="getColumnWidth('sizeInch', 90)" />
        <el-table-column v-else-if="key === 'status'" column-key="status" label="状态" :width="getColumnWidth('status', 120)">
          <template #default="{ row }">
            <div class="status-stack">
              <span>{{ statusText(row.status) }}</span>
              <el-popover v-if="Number(row.archived || 0) === 1" placement="top" trigger="hover" :width="280">
                <template #reference>
                  <el-tag size="small" type="warning" effect="plain">已归档</el-tag>
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
        <el-table-column v-else-if="key === 'inventory'" column-key="inventory" label="盘点状态" :width="getColumnWidth('inventory', 160)">
          <template #default="{ row }">
            <div class="inventory-stack">
              <el-tag :type="inventoryStatusTagType(row.inventory_status)">{{ inventoryStatusText(row.inventory_status) }}</el-tag>
              <div class="table-subtle">
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
        <el-table-column v-else-if="key === 'location'" column-key="location" label="位置" :width="getColumnWidth('location')" :min-width="180">
          <template #default="{ row }">{{ locationText(row) }}</template>
        </el-table-column>
        <el-table-column v-else-if="key === 'owner'" column-key="owner" label="领用人" :width="getColumnWidth('owner')" :min-width="180">
          <template #default="{ row }">
            <span v-if="row.employee_no || row.employee_name">{{ row.employee_name }}（{{ row.employee_no }}）</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column v-else-if="key === 'department'" column-key="department" prop="department" label="部门" :width="getColumnWidth('department')" :min-width="140" />
        <el-table-column v-else-if="key === 'remark'" column-key="remark" prop="remark" label="备注" :width="getColumnWidth('remark', 180)" :min-width="180" show-overflow-tooltip />
        <el-table-column v-else-if="key === 'archiveReason'" column-key="archiveReason" prop="archived_reason" label="归档原因" :width="getColumnWidth('archiveReason', 160)" :min-width="160" show-overflow-tooltip />
        <el-table-column v-else-if="key === 'updatedAt'" column-key="updatedAt" prop="updated_at" label="更新时间" :width="getColumnWidth('updatedAt')" :min-width="170" />
      </template>

      <el-table-column label="操作" width="300" fixed="right">
        <template #default="{ row }">
          <div v-if="Number(row.archived || 0) === 1" class="monitor-op-group compact">
            <el-button v-if="isAdmin" link type="primary" :disabled="loading" @click="emit('restore', row)">恢复归档</el-button>
            <el-button v-if="isAdmin" link type="danger" :disabled="loading" @click="emit('remove', row)">彻底删除</el-button>
            <span v-else class="table-subtle">已归档</span>
          </div>
          <div v-else class="monitor-op-group compact">
            <el-button v-if="props.showInventoryColumn && recommendedAction(row)" link type="danger" :disabled="loading" @click="handleRecommendedAction(row)">{{ recommendedAction(row)?.label }}</el-button>
            <el-button v-if="canOperator" link type="success" :disabled="loading" @click="emit('in', row)">入库</el-button>
            <el-button v-if="canOperator" link type="warning" :disabled="loading" @click="emit('out', row)">出库</el-button>
            <el-dropdown v-if="canOperator || isAdmin" trigger="click" :disabled="loading" @command="(command: string | number | object) => emit('row-more', String(command), row)">
              <el-button link class="row-more-trigger" :disabled="loading">
                更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="isAdmin" command="edit">编辑</el-dropdown-item>
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
        <el-empty description="暂无匹配数据" />
      </template>
    </el-table>
    <div v-if="isChunking" class="render-hint">大页数据分段渲染中：已加载 {{ renderProgress.visible }}/{{ renderProgress.total }}</div>
    <div class="pager-wrap">
      <el-pagination
        background
        layout="total, sizes, prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        :page-sizes="[20, 50, 100, 200, 500]"
        @update:page-size="(value: number) => emit('size-change', value)"
        @update:current-page="(value: number) => emit('page-change', value)"
      />
    </div>
  </el-card>
</template>
<script setup lang="ts">
import { ElDropdown, ElDropdownItem, ElDropdownMenu, ElIcon, ElPopover } from 'element-plus';
import { computed, nextTick, ref, watch } from 'vue';
import { useChunkedRows } from '../../composables/useChunkedRows';
import { ArrowDown } from '@element-plus/icons-vue';
import { inventoryIssueTypeText, inventoryStatusTagType, inventoryStatusText } from '../../types/assets';
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
  selectedIds: string[];
  showInventoryColumn: boolean;
  enableInventoryHighlight: boolean;
  statusText: (status: string) => string;
  locationText: (row: Record<string, any>) => string;
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
}>();
const orderedVisibleColumns = computed(() => props.showInventoryColumn ? props.visibleColumns : props.visibleColumns.filter((key) => key !== 'inventory'));
const tableRef = ref<any>();
const syncingSelection = ref(false);
const { renderRows, renderProgress, isChunking } = useChunkedRows(() => props.rows, { threshold: 120, chunkSize: 80 });
const getColumnWidth = (key: string, fallback?: number) => props.columnWidths[key] || fallback;
const sequenceNumber = (index: number) => (Math.max(1, Number(props.page) || 1) - 1) * (Number(props.pageSize) || 0) + index + 1;

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

function handleRecommendedAction(row: Record<string, any>) {
  const action = recommendedAction(row);
  if (!action) return;
  emit('open-recommended', action.command, row);
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
.render-hint { margin-top: 10px; color: #909399; font-size: 12px; }
.pager-wrap { margin-top: 12px; display: flex; justify-content: flex-end; }
.monitor-op-group.compact { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.row-more-trigger { padding-left: 0; padding-right: 0; }
.status-stack { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.inventory-stack { display:flex; flex-direction:column; gap:6px; }
.inventory-advice { color: var(--el-color-danger); font-size: 12px; line-height: 1.5; }
.asset-link { cursor: pointer; color: var(--el-color-primary); }
.strong { font-weight: 600; }
.archive-tag { margin-left: 8px; }
.table-subtle { color: #909399; font-size: 12px; }
.archive-detail{ line-height:1.8; font-size:12px; color:#606266; }
:deep(.inventory-row-issue td) { background: linear-gradient(90deg, rgba(245, 108, 108, 0.12) 0%, rgba(255,255,255,0) 18%), rgba(245, 108, 108, 0.06); }
:deep(.inventory-row-issue td:first-child) { box-shadow: inset 4px 0 0 rgba(245, 108, 108, 0.85); }
:deep(.inventory-row-unchecked td) { background: linear-gradient(90deg, rgba(144, 147, 153, 0.10) 0%, rgba(255,255,255,0) 18%), rgba(144, 147, 153, 0.04); }
:deep(.inventory-row-unchecked td:first-child) { box-shadow: inset 4px 0 0 rgba(144, 147, 153, 0.75); }
</style>
