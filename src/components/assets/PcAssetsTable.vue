<template>
  <BaseAssetsTable
    :rows="rows"
    :loading="loading"
    :initial-loading="initialLoading"
    :page="page"
    :page-size="pageSize"
    :total="total"
    :visible-columns="visibleColumns"
    :column-widths="columnWidths"
    :density="density"
    :selected-ids="selectedIds"
    :show-inventory-column="showInventoryColumn"
    :enable-inventory-highlight="enableInventoryHighlight"
    :has-filters="hasFilters"
    :mobile-mode="mobileMode"
    empty-data-tip="当前还没有电脑台账记录。"
    sequence-label="ID"
    :sequence-width="80"
    use-lightweight-stage
    :core-column-keys="['computer', 'status']"
    @selection-change="emit('selection-change', $event)"
    @column-resize="emit('column-resize', $event)"
    @page-change="emit('page-change', $event)"
    @page-size-change="emit('page-size-change', $event)"
    @reset-filters="emit('reset-filters')"
  >
    <template #columns="{ effectiveColumns, getColumnWidth, isLightweightStage, tableFixedLeft }">
      <template v-for="key in effectiveColumns" :key="key">
        <el-table-column
          v-if="key === 'computer'"
          column-key="computer"
          label="电脑"
          :width="getColumnWidth('computer')"
          :min-width="280"
          :fixed="tableFixedLeft"
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
              <div v-if="showInventoryColumn && recommendedAction(row)" class="inventory-advice ellipsis">{{ recommendedAction(row)?.tip }}</div>
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
    </template>

    <template #action-column="{ tableFixedRight, loading: tableLoading }">
      <el-table-column v-if="canOperator || isAdmin" label="操作" width="96" align="center" :fixed="tableFixedRight">
        <template #default="{ row }">
          <div v-if="Number(row.archived || 0) === 1" class="row-action-wrap">
            <el-dropdown v-if="isAdmin" trigger="click" :disabled="tableLoading" @command="(command: string | number | object) => handleRowMore(String(command), row)">
              <el-button link class="row-more-trigger" :disabled="tableLoading">
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
            <el-dropdown trigger="click" :disabled="tableLoading" @command="(command: string | number | object) => handleRowMore(String(command), row)">
              <el-button link class="row-more-trigger" :disabled="tableLoading">
                更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="showInventoryColumn && recommendedAction(row)" :command="String(recommendedAction(row)?.command || '')">{{ recommendedAction(row)?.label }}</el-dropdown-item>
                  <el-dropdown-item v-if="showInventoryColumn && shouldShowLogsShortcut(row)" command="logs">看记录</el-dropdown-item>
                  <el-dropdown-item command="edit">修改</el-dropdown-item>
                  <el-dropdown-item command="qr">二维码</el-dropdown-item>
                  <el-dropdown-item v-if="isAdmin" command="delete" divided>删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>
    </template>
  </BaseAssetsTable>
</template>

<script setup lang="ts">
import { ElDropdown, ElDropdownItem, ElDropdownMenu } from 'element-plus/es/components/dropdown/index';
import { ElIcon } from 'element-plus/es/components/icon/index';
import { ElPopover } from 'element-plus/es/components/popover/index';
import { ArrowDown } from '@element-plus/icons-vue';
import BaseAssetsTable from './BaseAssetsTable.vue';
import { assetStatusClass, inventoryStatusClass } from '../../composables/useAssetTableShared';
import { assetStatusText, inventoryIssueTypeText, inventoryStatusText } from '../../types/assets';
import '../../styles/ledger-table-shared.css';

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

void props;

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
</script>
