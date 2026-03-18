<template>
  <el-card shadow="never" class="monitor-toolbar-card">
    <div class="monitor-toolbar">
      <div class="toolbar-left">
        <div class="toolbar-block">
          <div class="toolbar-block-title">
            筛选查询
          </div>
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
              :model-value="locationId"
              placeholder="位置"
              clearable
              filterable
              class="toolbar-location"
              @update:model-value="emit('update:location-id', $event || '')"
              @change="emit('search')"
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
            <div class="toolbar-actions-inline">
              <el-button type="primary" @click="emit('search')">
                查询
              </el-button>
            </div>
          </div>
        </div>
      </div>
      <div class="toolbar-right">
        <div class="toolbar-block">
          <div class="toolbar-head">
            <div>
              <div class="toolbar-block-title">
                快捷工具
              </div>
              <div class="toolbar-subtle">
                已选 {{ selectedCount }} 项，支持跨页保留
              </div>
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
                  <el-dropdown-item command="export-qr">
                    导出二维码链接
                  </el-dropdown-item>
                  <el-dropdown-item v-if="isAdmin" command="batch-delete" divided>
                    批量删除选中
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button :disabled="selectedCount === 0 || batchBusy" @click="emit('clear-selection')">
              清空已选
            </el-button>
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
                <el-checkbox v-for="item in orderedColumnOptions" :key="item.value" :label="item.value">
                  {{ item.label }}
                </el-checkbox>
              </el-checkbox-group>
              <div class="column-panel-title reorder-title">
                列顺序
              </div>
              <div v-if="orderedVisibleOptions.length" class="column-order-list">
                <div v-for="(item, index) in orderedVisibleOptions" :key="item.value" class="column-order-item">
                  <span>{{ index + 1 }}. {{ item.label }}</span>
                  <div class="column-order-actions">
                    <el-button text :disabled="index === 0" @click="emit('move-column', item.value, 'up')">
                      上移
                    </el-button>
                    <el-button text :disabled="index === orderedVisibleOptions.length - 1" @click="emit('move-column', item.value, 'down')">
                      下移
                    </el-button>
                  </div>
                </div>
              </div>
              <div v-else class="toolbar-subtle">
                请至少保留一列显示。
              </div>
            </el-popover>
          </div>
          <div class="toolbar-tool-actions">
            <el-button v-if="canOperator" type="primary" plain @click="emit('open-create')">
              新增台账
            </el-button>
            <el-dropdown v-if="canOperator || isAdmin" trigger="click" @command="handleMoreCommand">
              <el-button class="toolbar-more-button" :disabled="initQrBusy || batchBusy">
                更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="export" :disabled="exportBusy || importBusy || initQrBusy || batchBusy">
                    导出Excel
                  </el-dropdown-item>
                  <el-dropdown-item v-if="canOperator" command="download-template" :disabled="importBusy || batchBusy">
                    下载导入模板
                  </el-dropdown-item>
                  <el-dropdown-item v-if="canOperator" command="import" :disabled="importBusy || exportBusy || initQrBusy || batchBusy">
                    Excel导入
                  </el-dropdown-item>
                  <el-dropdown-item v-if="canOperator" command="location">
                    管理位置
                  </el-dropdown-item>
                  <el-dropdown-item v-if="isAdmin" command="initQr" :disabled="initQrBusy || batchBusy">
                    初始化二维码Key
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
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
import { computed, ref } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { ArrowDown } from '@element-plus/icons-vue';
const props = defineProps<{
  status: string;
  locationId: string | number;
  keyword: string;
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
}>();
const emit = defineEmits<{
  'update:status': [string];
  'update:location-id': [string | number];
  'update:keyword': [string];
  'update:visible-columns': [string[]];
  'move-column': [string, 'up' | 'down'];
  search: [];
  export: [];
  'export-selected': [];
  'export-selected-qr': [];
  'batch-delete': [];
  'clear-selection': [];
  'restore-columns': [];
  'download-template': [];
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
function openImportPicker() {
  const root = importUploadRef.value?.$el as HTMLElement | undefined;
  const input = root?.querySelector('input[type="file"]') as HTMLInputElement | null;
  input?.click();
}
function handleMoreCommand(command: string | number | object) {
  const value = String(command);
  if (value === 'export') return emit('export');
  if (value === 'download-template') return emit('download-template');
  if (value === 'import') return openImportPicker();
  emit('toolbar-more', value);
}
function handleBatchCommand(command: string | number | object) {
  const value = String(command);
  if (value === 'export-qr') return emit('export-selected-qr');
  if (value === 'batch-delete') return emit('batch-delete');
}
</script>
<style scoped>.monitor-toolbar{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(320px,.95fr);gap:16px}.toolbar-left,.toolbar-right{min-width:0}.toolbar-block{padding:14px 16px;border:1px solid #ebeef5;border-radius:16px;background:linear-gradient(180deg,#fff 0%,#fafcff 100%)}.toolbar-block-title{font-size:13px;font-weight:700;color:#606266}.toolbar-subtle{margin-top:4px;color:#909399;font-size:12px}.toolbar-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}.toolbar-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.toolbar-select{width:150px}.toolbar-location{width:220px}.toolbar-input{width:260px;max-width:100%}.toolbar-actions-inline{display:flex;gap:12px}.toolbar-selection-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px}.toolbar-tool-actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}.toolbar-tool-actions :deep(.el-button){width:100%;margin-left:0}.toolbar-upload-hidden{display:none}.column-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.column-panel-title{font-size:13px;font-weight:700;color:#606266;margin-bottom:8px}.reorder-title{margin-top:12px}.column-check-group{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}.column-order-list{display:flex;flex-direction:column;gap:8px}.column-order-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 10px;border:1px solid #ebeef5;border-radius:10px;background:#fff}.column-order-actions{display:flex;gap:4px}@media (max-width:1100px){.monitor-toolbar{grid-template-columns:1fr}}@media (max-width:768px){.toolbar-block{padding:12px}.toolbar-head{flex-direction:column;align-items:stretch}.toolbar-select,.toolbar-location,.toolbar-input,.toolbar-actions-inline,.toolbar-actions-inline :deep(.el-button),.toolbar-selection-row,.toolbar-selection-row :deep(.el-button),.toolbar-tool-actions,.toolbar-tool-actions :deep(.el-button){width:100%}.column-check-group{grid-template-columns:1fr}.column-order-item{flex-direction:column;align-items:stretch}}</style>
