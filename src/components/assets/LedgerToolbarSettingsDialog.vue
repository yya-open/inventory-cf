<template>
  <el-dialog
    :model-value="visible"
    title="表格设置"
    width="420px"
    class="ledger-toolbar-settings-dialog"
    append-to-body
    @update:model-value="(value) => emit('update:visible', Boolean(value))"
  >
    <div class="column-panel-head">
      <div class="column-panel-title">表格密度</div>
      <span class="toolbar-subtle toolbar-inline-tip">自动记住你的偏好</span>
    </div>
    <el-segmented
      :model-value="density"
      class="toolbar-density-mode"
      :options="densityOptions"
      @change="(value: string | number | boolean) => emit('update:density', String(value) as LedgerTableDensity)"
    />

    <div class="column-panel-title reorder-title">视图方案</div>
    <div class="saved-view-input-row">
      <el-input v-model="viewDraftName" placeholder="保存当前列设置" maxlength="24" clearable />
      <el-button type="primary" plain @click="handleSaveView">保存</el-button>
    </div>
    <div class="saved-view-list">
      <div class="saved-view-item" :class="{ active: activeViewName === 'default' }" role="button" tabindex="0" @click="emit('restore-columns')">
        <div class="saved-view-main">
          <div class="saved-view-name">默认视图</div>
          <div class="saved-view-meta">默认列顺序 + 标准密度</div>
        </div>
        <span class="saved-view-action">恢复</span>
      </div>
      <div
        v-for="item in savedViews"
        :key="item.name"
        class="saved-view-item"
        role="button"
        tabindex="0"
        :class="{ active: item.name === activeViewName }"
        @click="emit('apply-view', item.name)"
      >
        <div class="saved-view-main">
          <div class="saved-view-name">{{ item.name }}</div>
          <div class="saved-view-meta">{{ densityText(item.density) }} · {{ item.visibleColumns.length }} 列</div>
        </div>
        <div class="saved-view-actions">
          <span class="saved-view-action">应用</span>
          <el-button link type="primary" @click.stop="emit('set-default-view', item.name)">{{ item.name === defaultViewName ? '已默认' : '设为默认' }}</el-button>
          <el-button link type="danger" @click.stop="emit('delete-view', item.name)">删除</el-button>
        </div>
      </div>
      <div v-if="!savedViews.length" class="toolbar-subtle">还没有保存的视图，可将常用列布局保存起来反复使用。</div>
    </div>

    <div class="column-panel-head reorder-title">
      <div class="column-panel-title">表格列显示</div>
      <el-button text type="primary" @click="emit('restore-columns')">恢复默认</el-button>
    </div>
    <el-checkbox-group
      :model-value="visibleColumns"
      class="column-check-group"
      @update:model-value="emit('update:visible-columns', $event as string[])"
    >
      <el-checkbox v-for="item in orderedColumnOptions" :key="item.value" :value="item.value">{{ item.label }}</el-checkbox>
    </el-checkbox-group>
    <div class="column-panel-title reorder-title">列顺序</div>
    <div v-if="orderedVisibleOptions.length" class="column-order-list">
      <div v-for="(item, index) in orderedVisibleOptions" :key="item.value" class="column-order-item">
        <span>{{ index + 1 }}. {{ item.label }}</span>
        <div class="column-order-actions">
          <el-button text :disabled="index === 0" @click="emit('move-column', item.value, 'up')">上移</el-button>
          <el-button text :disabled="index === orderedVisibleOptions.length - 1" @click="emit('move-column', item.value, 'down')">下移</el-button>
        </div>
      </div>
    </div>
    <div v-else class="toolbar-subtle">请至少保留一列显示。</div>
    <template #footer>
      <div class="ledger-drawer__footer">
        <el-button @click="emit('update:visible', false)">完成</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ElDialog } from 'element-plus/es/components/dialog/index';
import { ElSegmented } from 'element-plus/es/components/segmented/index';
import { computed, ref } from 'vue';
import type { LedgerSavedView, LedgerTableDensity } from '../../utils/ledgerViewPrefs';

const props = defineProps<{
  visible: boolean;
  density: LedgerTableDensity;
  savedViews: LedgerSavedView[];
  activeViewName: string;
  defaultViewName?: string;
  visibleColumns: string[];
  columnOrder: string[];
  columnOptions: Array<{ value: string; label: string }>;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  'update:density': [LedgerTableDensity];
  'update:visible-columns': [string[]];
  'save-view': [string];
  'apply-view': [string];
  'delete-view': [string];
  'set-default-view': [string];
  'restore-columns': [];
  'move-column': [string, 'up' | 'down'];
}>();

const viewDraftName = ref('');

const densityOptions = [
  { label: '紧凑', value: 'compact' },
  { label: '标准', value: 'default' },
  { label: '宽松', value: 'comfortable' },
];

const orderedColumnOptions = computed(() => {
  const map = new Map(props.columnOptions.map((item) => [item.value, item]));
  return props.columnOrder.map((key) => map.get(key)).filter(Boolean) as Array<{ value: string; label: string }>;
});

const orderedVisibleOptions = computed(() => {
  const visibleSet = new Set(props.visibleColumns);
  return orderedColumnOptions.value.filter((item) => visibleSet.has(item.value));
});

function densityText(value: LedgerTableDensity) {
  if (value === 'compact') return '紧凑';
  if (value === 'comfortable') return '宽松';
  return '标准';
}

function handleSaveView() {
  const nextName = viewDraftName.value.trim();
  if (!nextName) return;
  emit('save-view', nextName);
  viewDraftName.value = '';
}
</script>

<style scoped>
.column-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.column-panel-title {
  font-size: 13px;
  font-weight: 700;
  color: #475569;
  margin-bottom: 8px;
}

.reorder-title {
  margin-top: 12px;
}

.column-check-group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
}

.column-order-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.column-order-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
}

.column-order-actions {
  display: flex;
  gap: 4px;
}

.toolbar-density-mode {
  width: 100%;
  overflow: hidden;
}

.toolbar-subtle {
  margin-top: 4px;
  color: #8a94a6;
  font-size: 12px;
  line-height: 1.55;
}

.toolbar-inline-tip {
  margin-top: 0;
}

.saved-view-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.saved-view-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  max-width: 100%;
  overflow: hidden;
}

.saved-view-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  box-sizing: border-box;
  padding: 12px 14px;
  text-align: left;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.94);
  cursor: pointer;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.saved-view-item:hover {
  transform: translateY(-1px);
  border-color: rgba(64, 158, 255, 0.28);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.06);
}

.saved-view-item.active {
  border-color: rgba(64, 158, 255, 0.34);
  box-shadow: inset 0 0 0 1px rgba(64, 158, 255, 0.12), 0 8px 16px rgba(64, 158, 255, 0.08);
}

.saved-view-main {
  min-width: 0;
  flex: 1 1 auto;
}

.saved-view-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
}

.saved-view-meta {
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: #8a94a6;
}

.saved-view-actions {
  display: inline-flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 42%;
}

.saved-view-action {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 700;
  color: var(--el-color-primary);
}

@media (max-width: 768px) {
  .saved-view-input-row {
    flex-direction: column;
    align-items: stretch;
  }

  .saved-view-input-row :deep(.el-input),
  .saved-view-input-row :deep(.el-button) {
    width: 100%;
  }

  .column-check-group,
  .column-order-item,
  .saved-view-item {
    flex-direction: column;
    align-items: stretch;
  }
}

:deep(.ledger-toolbar-settings-dialog .el-dialog__body) {
  padding-top: 12px;
}

:deep(.ledger-toolbar-settings-dialog .el-dialog__header) {
  padding-bottom: 4px;
}

:deep(.ledger-toolbar-settings-dialog .el-dialog__content) {
  overflow: hidden;
}

:deep(.el-segmented) {
  padding: 4px;
  border-radius: 14px;
  background: rgba(148, 163, 184, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.76);
}

:deep(.el-segmented__item) {
  min-height: 34px;
  border-radius: 10px;
  color: #475569;
  font-weight: 600;
}

:deep(.el-segmented__item-selected) {
  box-shadow: 0 10px 18px rgba(64, 158, 255, 0.18);
}

:deep(.el-segmented__item.is-selected),
:deep(.el-segmented__item.is-selected .el-segmented__item-label) {
  color: #fff;
}
</style>
