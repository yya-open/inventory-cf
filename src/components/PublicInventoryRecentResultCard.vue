<template>
  <el-alert
    v-if="record"
    class="recent-result-alert"
    :title="record.source === 'duplicate' ? '最近一次结果提示（重复提交提醒）' : '最近一次结果提示'"
    type="success"
    show-icon
    :closable="false"
  >
    <template #default>
      <div class="recent-result-body">
        <div class="recent-result-main">
          <el-tag :type="record.action === 'ISSUE' ? 'warning' : 'success'">
            {{ record.action === 'ISSUE' ? `异常${record.issue_type ? ` · ${issueTypeText(record.issue_type)}` : ''}` : '在位' }}
          </el-tag>
          <span class="recent-result-target">{{ record.target_label || '-' }}</span>
          <span class="recent-result-time">{{ record.created_at || '-' }}</span>
        </div>
        <div v-if="record.message" class="recent-result-message">{{ record.message }}</div>
        <div v-if="record.remark" class="recent-result-remark">备注：{{ record.remark }}</div>
      </div>
    </template>
  </el-alert>
</template>

<script setup lang="ts">
import { inventoryIssueTypeText as issueTypeText } from '../types/assets';

defineProps<{
  record: any;
}>();
</script>

<style scoped>
.recent-result-alert { margin-bottom: 12px; }
.recent-result-body { display:flex; flex-direction:column; gap:8px; }
.recent-result-main { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.recent-result-target { font-weight: 600; color:#303133; }
.recent-result-time { font-size: 12px; color:#909399; }
.recent-result-message,
.recent-result-remark { font-size: 12px; color:#606266; line-height:1.6; }
</style>
