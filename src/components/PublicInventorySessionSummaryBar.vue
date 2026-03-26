<template>
  <el-alert
    v-if="summary && summary.processed > 0"
    class="session-summary-alert"
    type="info"
    show-icon
    :closable="false"
    title="连续盘点小结"
  >
    <template #default>
      <div class="session-summary-body">
        <div class="session-summary-main">
          <strong>{{ summary.batch_name || '当前批次' }}</strong>
          <span>已连续处理 {{ summary.processed }} 台</span>
          <span>在位 {{ summary.ok }} 台</span>
          <span>异常 {{ summary.issue }} 台</span>
        </div>
        <div class="session-summary-meta">
          <span>开始于 {{ summary.started_at || '-' }}</span>
          <span v-if="summary.last_target">最近处理：{{ summary.last_target }}</span>
          <el-button size="small" text @click="$emit('reset')">清空小结</el-button>
        </div>
      </div>
    </template>
  </el-alert>
</template>

<script setup lang="ts">
defineProps<{ summary: any }>();
defineEmits<{ reset: [] }>();
</script>

<style scoped>
.session-summary-alert { margin-bottom: 12px; }
.session-summary-body { display:flex; flex-direction:column; gap:8px; }
.session-summary-main, .session-summary-meta { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
.session-summary-main { color:#303133; }
.session-summary-meta { font-size:12px; color:#909399; }
</style>
