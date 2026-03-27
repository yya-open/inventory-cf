<template>
  <el-dialog :model-value="visible" :title="`开启新一轮${kindLabel}盘点`" width="620px" destroy-on-close @close="emit('update:visible', false)">
    <div class="start-wrap">
      <div class="start-card intro">
        <div class="start-title">风险确认</div>
        <div class="start-subtle">开启后会立即生成新批次，并执行以下操作：</div>
        <ul class="start-risk-list">
          <li>清空当前盘点记录（{{ preview.logTotal }} 条）</li>
          <li>将{{ kindLabel }}台账盘点状态整体重置为“未盘”（{{ preview.assetTotal }} 台）</li>
          <li>历史批次只保留当前/上一轮，更早批次会自动清理</li>
          <li v-if="preview.activeName">当前进行中的批次会先自动结束：{{ preview.activeName }}</li>
        </ul>
      </div>

      <div class="start-card">
        <div class="start-title">批次名称</div>
        <el-input v-model="localName" placeholder="请输入批次名称" maxlength="60" clearable />
        <div class="start-subtle">默认按“日期 + 序号”生成，方便同一天多轮盘点时区分。</div>
      </div>

      <div class="start-card metrics">
        <div class="start-title">开启前概览</div>
        <div class="metric-grid">
          <div class="metric-card total">
            <span>台账总数</span>
            <strong>{{ preview.assetTotal }}</strong>
          </div>
          <div class="metric-card checked">
            <span>当前已盘</span>
            <strong>{{ preview.checkedOk }}</strong>
          </div>
          <div class="metric-card issue">
            <span>当前异常</span>
            <strong>{{ preview.checkedIssue }}</strong>
          </div>
          <div class="metric-card unchecked">
            <span>当前未盘</span>
            <strong>{{ preview.unchecked }}</strong>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="loading" @click="confirmStart">确认开启</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  visible: boolean;
  kindLabel: string;
  suggestedName: string;
  loading: boolean;
  preview: {
    assetTotal: number;
    checkedOk: number;
    checkedIssue: number;
    unchecked: number;
    logTotal: number;
    activeName?: string | null;
  };
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  confirm: [string];
}>();

const localName = ref('');

watch(
  () => [props.visible, props.suggestedName],
  () => {
    if (props.visible) localName.value = props.suggestedName || '';
  },
  { immediate: true },
);

function confirmStart() {
  const value = String(localName.value || '').trim();
  if (!value) return;
  emit('confirm', value);
}
</script>

<style scoped>
.start-wrap { display:flex; flex-direction:column; gap:14px; }
.start-card { border:1px solid #ebeef5; border-radius:16px; padding:14px 16px; background:linear-gradient(180deg, #fff 0%, #f8fbff 100%); }
.start-title { font-size:14px; font-weight:700; color:#303133; }
.start-subtle { margin-top:8px; color:#909399; font-size:12px; line-height:1.7; }
.start-risk-list { margin:10px 0 0; padding-left: 18px; color:#606266; font-size:13px; line-height:1.8; }
.metric-grid { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:10px; margin-top:12px; }
.metric-card { border-radius: 12px; padding: 10px 12px; background:#fff; border:1px solid #ebeef5; display:flex; flex-direction:column; gap:6px; }
.metric-card strong { font-size:20px; color:#303133; }
.metric-card.checked strong { color: var(--el-color-success); }
.metric-card.issue strong { color: var(--el-color-danger); }
.metric-card.unchecked strong { color: var(--el-color-info); }
@media (max-width: 640px) { .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
