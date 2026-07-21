<template>
  <div class="batch-actions-card">
    <div>
      <div class="batch-actions-title">盘点操作</div>
      <div class="batch-actions-subtle">将执行入口、历史定位与记录查看集中到这里。</div>
    </div>
    <div class="batch-actions-row">
      <el-button v-if="isAdmin" type="primary" :disabled="busy" @click="emitTracked('start-batch')">开启新一轮</el-button>
      <el-button v-if="isAdmin && active" type="warning" plain :disabled="busy" @click="emitTracked('close-batch')">结束本轮</el-button>
      <el-dropdown trigger="click" @command="handleCommand">
        <el-button :disabled="busy">
          更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="open-execution">进入盘点模式</el-dropdown-item>
            <el-dropdown-item command="open-history">批次历史</el-dropdown-item>
            <el-dropdown-item command="jump-logs">盘点记录</el-dropdown-item>
            <el-dropdown-item v-if="isAdmin && active" command="close-batch" divided>结束本轮</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElDropdown, ElDropdownItem, ElDropdownMenu } from 'element-plus/es/components/dropdown/index';
import { ElIcon } from 'element-plus/es/components/icon/index';
import { ArrowDown } from '@element-plus/icons-vue';
import { trackUiEvent } from '../../utils/browserPerf';

const props = defineProps<{
  busy?: boolean;
  isAdmin?: boolean;
  active?: boolean;
}>();

const emit = defineEmits<{
  (event: 'start-batch'): void;
  (event: 'close-batch'): void;
  (event: 'open-history'): void;
  (event: 'open-execution'): void;
  (event: 'jump-logs'): void;
}>();

function emitTracked(name: 'start-batch' | 'close-batch' | 'open-history' | 'open-execution' | 'jump-logs') {
  trackUiEvent('inventory_batch_action', {
    metadata: {
      action: name,
      active: !!props.active,
      is_admin: !!props.isAdmin,
    },
  });
  switch (name) {
    case 'start-batch':
      emit('start-batch');
      return;
    case 'close-batch':
      emit('close-batch');
      return;
    case 'open-history':
      emit('open-history');
      return;
    case 'open-execution':
      emit('open-execution');
      return;
    case 'jump-logs':
      emit('jump-logs');
      return;
  }
}

function handleCommand(command: string | number | object) {
  const value = String(command);
  if (value === 'open-execution') return emitTracked('open-execution');
  if (value === 'open-history') return emitTracked('open-history');
  if (value === 'jump-logs') return emitTracked('jump-logs');
  if (value === 'close-batch') return emitTracked('close-batch');
}
</script>

<style scoped>
.batch-actions-card {
  border: 1px solid var(--border);
  border-radius:var(--radius-xl);
  background: var(--surface);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.batch-actions-title { font-size: 14px; font-weight: 700; color: var(--ink); }
.batch-actions-subtle { margin-top: 4px; color:var(--subtle); font-size:12px; line-height:1.6; }
.batch-actions-row { display:flex; flex-wrap:wrap; gap:10px; }
@media (max-width: 768px) {
  .batch-actions-row, .batch-actions-row :deep(.el-button) { width: 100%; }
}
</style>
