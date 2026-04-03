<template>
  <el-dialog
    :model-value="visible"
    width="480px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    destroy-on-close
    title="批量导出中"
  >
    <div class="progress-wrap">
      <div class="progress-title">{{ title || '正在生成二维码导出文件' }}</div>
      <div class="progress-stage">{{ stageText }}</div>
      <el-progress :percentage="percentage" :stroke-width="14" />
      <div class="progress-meta">
        <span>{{ completed }} / {{ total }}</span>
        <span>{{ Math.round(percentage) }}%</span>
      </div>
      <div v-if="detail" class="progress-detail">{{ detail }}</div>
      <div class="progress-tip">导出过程中请勿关闭当前页面，生成完成后会自动下载。</div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  visible: boolean;
  title?: string;
  stage?: string;
  completed?: number;
  total?: number;
  detail?: string;
}>(), {
  title: '正在生成二维码导出文件',
  stage: '准备中',
  completed: 0,
  total: 1,
  detail: '',
});

const percentage = computed(() => {
  const total = Math.max(1, Number(props.total || 1));
  const completed = Math.min(total, Math.max(0, Number(props.completed || 0)));
  return Number(((completed / total) * 100).toFixed(1));
});

const stageText = computed(() => props.stage || '准备中');
</script>

<style scoped>
.progress-wrap{display:grid;gap:12px}
.progress-title{font-size:16px;font-weight:700;color:#111827}
.progress-stage{font-size:13px;color:#475569}
.progress-meta{display:flex;justify-content:space-between;font-size:12px;color:#64748b}
.progress-detail{font-size:12px;color:#334155;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;line-height:1.6}
.progress-tip{font-size:12px;color:#94a3b8}
</style>
