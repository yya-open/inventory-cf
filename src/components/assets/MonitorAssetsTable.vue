<template>
  <el-card shadow="never">
    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="rows"
      row-key="id"
      size="small"
      border
      @selection-change="handleSelectionChange"
      @header-dragend="handleHeaderDragend"
    >
      <el-table-column
        type="selection"
        width="48"
        fixed="left"
      />
      <el-table-column
        prop="id"
        label="ID"
        width="70"
        fixed="left"
      />

      <template
        v-for="key in orderedVisibleColumns"
        :key="key"
      >
        <el-table-column
          v-if="key === 'assetCode'"
          column-key="assetCode"
          prop="asset_code"
          label="资产编号"
          :width="getColumnWidth('assetCode')"
          :min-width="160"
          fixed="left"
        />
        <el-table-column
          v-else-if="key === 'sn'"
          column-key="sn"
          prop="sn"
          label="SN"
          :width="getColumnWidth('sn')"
          :min-width="140"
        />
        <el-table-column
          v-else-if="key === 'model'"
          column-key="model"
          label="型号"
          :width="getColumnWidth('model')"
          :min-width="200"
        >
          <template #default="{ row }">
            <span>{{ [row.brand, row.model].filter(Boolean).join(' ') }}</span>
          </template>
        </el-table-column>
        <el-table-column
          v-else-if="key === 'size'"
          column-key="size"
          prop="size_inch"
          label="尺寸"
          :width="getColumnWidth('size', 90)"
        />
        <el-table-column
          v-else-if="key === 'status'"
          column-key="status"
          label="状态"
          :width="getColumnWidth('status', 110)"
        >
          <template #default="{ row }">
            {{ statusText(row.status) }}
          </template>
        </el-table-column>
        <el-table-column
          v-else-if="key === 'location'"
          column-key="location"
          label="位置"
          :width="getColumnWidth('location')"
          :min-width="180"
        >
          <template #default="{ row }">
            {{ locationText(row) }}
          </template>
        </el-table-column>
        <el-table-column
          v-else-if="key === 'owner'"
          column-key="owner"
          label="领用人"
          :width="getColumnWidth('owner')"
          :min-width="180"
        >
          <template #default="{ row }">
            <span v-if="row.employee_no || row.employee_name">{{ row.employee_name }}（{{ row.employee_no }}）</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column
          v-else-if="key === 'department'"
          column-key="department"
          prop="department"
          label="部门"
          :width="getColumnWidth('department')"
          :min-width="140"
        />
        <el-table-column
          v-else-if="key === 'updatedAt'"
          column-key="updatedAt"
          prop="updated_at"
          label="更新时间"
          :width="getColumnWidth('updatedAt')"
          :min-width="170"
        />
      </template>

      <el-table-column
        label="操作"
        width="220"
        fixed="right"
      >
        <template #default="{ row }">
          <div class="monitor-op-group compact">
            <el-button
              v-if="canOperator"
              link
              type="success"
              :disabled="loading"
              @click="emit('in', row)"
            >
              入库
            </el-button>
            <el-button
              v-if="canOperator"
              link
              type="warning"
              :disabled="loading"
              @click="emit('out', row)"
            >
              出库
            </el-button>
            <el-dropdown
              v-if="canOperator || isAdmin"
              trigger="click"
              :disabled="loading"
              @command="(command: string | number | object) => emit('row-more', String(command), row)"
            >
              <el-button
                link
                class="row-more-trigger"
                :disabled="loading"
              >
                更多<el-icon class="el-icon--right">
                  <ArrowDown />
                </el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-if="isAdmin"
                    command="edit"
                  >
                    编辑
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-if="canOperator"
                    command="qr"
                  >
                    二维码
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-if="canOperator"
                    command="return"
                  >
                    归还
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-if="canOperator"
                    command="transfer"
                  >
                    调拨
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-if="isAdmin"
                    command="delete"
                    divided
                  >
                    删除
                  </el-dropdown-item>
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
    <div class="pager-wrap">
      <el-pagination
        background
        layout="total, sizes, prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @update:page-size="(value: number) => emit('size-change', value)"
        @update:current-page="(value: number) => emit('page-change', value)"
      />
    </div>
  </el-card>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ArrowDown } from '@element-plus/icons-vue';
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
  statusText: (status: string) => string;
  locationText: (row: Record<string, any>) => string;
}>();
const emit = defineEmits<{
  in: [Record<string, any>];
  out: [Record<string, any>];
  'row-more': [string, Record<string, any>];
  'selection-change': [Record<string, any>[]];
  'column-resize': [{ key: string; width: number }];
  'page-change': [number];
  'size-change': [number];
}>();
const orderedVisibleColumns = computed(() => props.visibleColumns);
const tableRef = ref<any>();
const syncingSelection = ref(false);
const getColumnWidth = (key: string, fallback?: number) => props.columnWidths[key] || fallback;

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
function handleHeaderDragend(newWidth: number, _oldWidth: number, column: any) {
  const key = String(column?.columnKey || '');
  if (!key) return;
  emit('column-resize', { key, width: Number(newWidth) });
}
</script>
<style scoped>.pager-wrap{display:flex;justify-content:flex-end;margin-top:12px}.monitor-op-group.compact{display:flex;align-items:center;gap:6px}.row-more-trigger{padding-inline:4px}.row-more-trigger :deep(.el-icon){margin-left:2px}</style>
