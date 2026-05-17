<template>
  <el-card shadow="never" class="ledger-table-card">
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
      empty-data-tip="当前还没有显示器台账记录。"
      table-size="small"
      @selection-change="emit('selection-change', $event)"
      @column-resize="emit('column-resize', $event)"
      @page-change="emit('page-change', $event)"
      @page-size-change="emit('size-change', $event)"
      @reset-filters="emit('reset-filters')"
    >
      <template #columns="{ effectiveColumns, getColumnWidth, tableFixedLeft }">
        <template v-for="key in effectiveColumns" :key="key">
          <el-table-column v-if="key === 'assetCode'" column-key="assetCode" label="资产编号" :width="getColumnWidth('assetCode')" :min-width="170" :fixed="tableFixedLeft">
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
                  <template v-else>本轮未盘</template>
                </div>
                <div v-if="showInventoryColumn && recommendedAction(row)" class="inventory-advice">{{ recommendedAction(row)?.tip }}</div>
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
      </template>

      <template #action-column="{ tableFixedRight, loading: tableLoading }">
        <el-table-column label="操作" width="96" align="center" :fixed="tableFixedRight">
          <template #default="{ row }">
            <div v-if="Number(row.archived || 0) === 1" class="row-action-wrap">
              <el-dropdown v-if="isAdmin" trigger="click" :disabled="tableLoading" @command="(command: string | number | object) => emit('row-more', String(command), row)">
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
              <el-dropdown v-if="canOperator || isAdmin" trigger="click" :disabled="tableLoading" @command="(command: string | number | object) => emit('row-more', String(command), row)">
                <el-button link class="row-more-trigger" :disabled="tableLoading">
                  更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="showInventoryColumn && recommendedAction(row)" :command="String(recommendedAction(row)?.command || '')">{{ recommendedAction(row)?.label }}</el-dropdown-item>
                    <el-dropdown-item v-if="showInventoryColumn && shouldShowLogsShortcut(row)" command="logs">看记录</el-dropdown-item>
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
      </template>
    </BaseAssetsTable>
  </el-card>
</template>

<script setup lang="ts">
import { ElDropdown, ElDropdownItem, ElDropdownMenu } from 'element-plus/es/components/dropdown/index';
import { ElIcon } from 'element-plus/es/components/icon/index';
import { ElPopover } from 'element-plus/es/components/popover/index';
import { ArrowDown } from '@element-plus/icons-vue';
import BaseAssetsTable from './BaseAssetsTable.vue';
import { assetStatusClass, inventoryStatusClass } from '../../composables/useAssetTableShared';
import { inventoryIssueTypeText, inventoryStatusText } from '../../types/assets';
import '../../styles/ledger-table-shared.css';

const props = defineProps<{
  rows: Array<Record<string, any>>;
  loading: boolean;
  initialLoading: boolean;
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
  mobileMode?: boolean;
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

const { statusText, locationText, showInventoryColumn } = props;

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
</script>
