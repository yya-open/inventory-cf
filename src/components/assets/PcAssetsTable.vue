<template>
  <div>
    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="rows"
      row-key="id"
      border
      :row-class-name="rowClassName"
      @selection-change="handleSelectionChange"
      @header-dragend="handleHeaderDragend"
    >
      <el-table-column type="selection" width="48" fixed="left" />
      <el-table-column label="ID" width="80" fixed="left">
        <template #default="{ $index }">
          {{ (page - 1) * pageSize + $index + 1 }}
        </template>
      </el-table-column>

      <template v-for="key in orderedVisibleColumns" :key="key">
        <el-table-column
          v-if="key === 'computer'"
          column-key="computer"
          label="电脑"
          :width="getColumnWidth('computer')"
          :min-width="260"
          fixed="left"
        >
          <template #default="{ row }">
            <div class="asset-link strong" @click="emit('open-info', row)">
              {{ row.brand }} · {{ row.model }}
            </div>
            <div class="asset-link subtle" @click="emit('open-info', row)">
              SN：{{ row.serial_no }}
            </div>
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

        <el-table-column v-else-if="key === 'config'" column-key="config" label="配置" :width="getColumnWidth('config')" :min-width="170">
          <template #default="{ row }">
            <div>{{ row.disk_capacity || '-' }} / {{ row.memory_size || '-' }}</div>
            <div class="subtle">保修：{{ row.warranty_end || '-' }}</div>
          </template>
        </el-table-column>

        <el-table-column v-else-if="key === 'status'" column-key="status" label="状态" :width="getColumnWidth('status', 140)">
          <template #default="{ row }">
            <div class="status-stack">
              <el-tag v-if="row.status === 'IN_STOCK'" type="success">在库</el-tag>
              <el-tag v-else-if="row.status === 'ASSIGNED'" type="warning">已领用</el-tag>
              <el-tag v-else-if="row.status === 'RECYCLED'" type="info">已回收</el-tag>
              <el-tag v-else type="danger">已报废</el-tag>
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
              <div class="subtle">
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
              <div v-if="recommendedAction(row)" class="inventory-advice">{{ recommendedAction(row)?.tip }}</div>
            </div>
          </template>
        </el-table-column>

        <el-table-column v-else-if="key === 'owner'" column-key="owner" label="当前领用人" :width="getColumnWidth('owner')" :min-width="220">
          <template #default="{ row }">
            <div v-if="row.status === 'ASSIGNED'">
              <div class="strong">{{ row.last_employee_name || '-' }}</div>
              <div class="subtle">{{ row.last_employee_no || '-' }} · {{ row.last_department || '-' }}</div>
            </div>
            <span v-else>-</span>
          </template>
        </el-table-column>

        <el-table-column v-else-if="key === 'configDate'" column-key="configDate" prop="last_config_date" label="配置日期" :width="getColumnWidth('configDate', 130)" />
        <el-table-column v-else-if="key === 'recycleDate'" column-key="recycleDate" prop="last_recycle_date" label="回收日期" :width="getColumnWidth('recycleDate', 130)" />
        <el-table-column v-else-if="key === 'remark'" column-key="remark" prop="remark" label="备注" :width="getColumnWidth('remark')" :min-width="220" show-overflow-tooltip />
      </template>

      <el-table-column v-if="canOperator || isAdmin" label="操作" :width="300" fixed="right">
        <template #default="{ row }">
          <div v-if="Number(row.archived || 0) === 1" class="row-archived-actions">
            <el-button v-if="isAdmin" link type="primary" :disabled="loading" @click="emit('restore', row)">恢复归档</el-button>
            <el-button v-if="isAdmin" link type="danger" :disabled="loading" @click="emit('remove', row)">彻底删除</el-button>
            <span v-else class="subtle">已归档</span>
          </div>
          <template v-else>
            <el-button v-if="recommendedAction(row)" link type="danger" :disabled="loading" @click="handleRecommendedAction(row)">{{ recommendedAction(row)?.label }}</el-button>
            <el-button link type="primary" :disabled="loading" @click="emit('open-edit', row)">修改</el-button>
            <el-button link :disabled="loading" @click="emit('open-qr', row)">二维码</el-button>
            <el-button v-if="isAdmin" link type="danger" :disabled="loading" @click="emit('remove', row)">删除</el-button>
          </template>
        </template>
      </el-table-column>

      <template #empty>
        <el-empty description="暂无匹配数据" />
      </template>
    </el-table>
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
import { ElPopover } from 'element-plus';
import { computed, nextTick, ref, watch } from 'vue';
import { inventoryIssueTypeText, inventoryStatusTagType, inventoryStatusText } from '../../types/assets';
const props = defineProps<{
  rows: Array<Record<string, any>>;
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  canOperator: boolean;
  isAdmin: boolean;
  visibleColumns: string[];
  columnWidths: Record<string, number>;
  selectedIds: string[];
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
}>();
const orderedVisibleColumns = computed(() => props.visibleColumns);
const tableRef = ref<any>();
const syncingSelection = ref(false);
const getColumnWidth = (key: string, fallback?: number) => props.columnWidths[key] || fallback;

function rowClassName({ row }: { row: Record<string, any> }) {
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
  props.rows.forEach((row) => {
    if (selectedSet.has(String(row.id))) tableRef.value.toggleRowSelection(row, true);
  });
  await nextTick();
  syncingSelection.value = false;
}

watch(() => [props.rows, props.selectedIds], () => {
  nextTick(syncSelection);
}, { deep: true, immediate: true });

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

function handleRecommendedAction(row: Record<string, any>) {
  const action = recommendedAction(row);
  if (!action) return;
  emit('open-recommended', action.command, row);
}

function handleHeaderDragend(newWidth: number, _oldWidth: number, column: any) {
  const key = String(column?.columnKey || '');
  if (!key) return;
  emit('column-resize', { key, width: Number(newWidth) });
}
</script>
<style scoped>
.pager-wrap { display:flex; justify-content:flex-end; margin-top:12px; }
.asset-link { cursor:pointer; }
.strong { font-weight:600; }
.subtle { color:#999; font-size:12px; }
.status-stack { display:flex; flex-wrap:wrap; gap:6px; }
.inventory-stack { display:flex; flex-direction:column; gap:6px; }
.inventory-advice { color: var(--el-color-danger); font-size: 12px; line-height: 1.5; }
.archive-tag { margin-top:6px; }
.row-archived-actions { display:flex; align-items:center; }
.archive-detail{ line-height:1.8; font-size:12px; color:#606266; }
:deep(.inventory-row-issue td) { background: linear-gradient(90deg, rgba(245, 108, 108, 0.12) 0%, rgba(255,255,255,0) 18%), rgba(245, 108, 108, 0.06); }
:deep(.inventory-row-issue td:first-child) { box-shadow: inset 4px 0 0 rgba(245, 108, 108, 0.85); }
:deep(.inventory-row-unchecked td) { background: linear-gradient(90deg, rgba(144, 147, 153, 0.10) 0%, rgba(255,255,255,0) 18%), rgba(144, 147, 153, 0.04); }
:deep(.inventory-row-unchecked td:first-child) { box-shadow: inset 4px 0 0 rgba(144, 147, 153, 0.75); }
</style>
