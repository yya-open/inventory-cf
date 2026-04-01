<template>
  <el-dialog
    :model-value="visible"
    title="显示器信息"
    width="720px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <el-descriptions :column="2" border>
      <el-descriptions-item label="资产编号">{{ row?.asset_code || '-' }}</el-descriptions-item>
      <el-descriptions-item label="SN">{{ row?.sn || '-' }}</el-descriptions-item>
      <el-descriptions-item label="品牌">{{ row?.brand || '-' }}</el-descriptions-item>
      <el-descriptions-item label="型号">{{ row?.model || '-' }}</el-descriptions-item>
      <el-descriptions-item label="尺寸">{{ row?.size_inch || '-' }}</el-descriptions-item>
      <el-descriptions-item label="状态">
        <el-tag :type="statusTagType(row?.status)">{{ statusText(row?.status || '') }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="位置" :span="2">{{ locationText(row) }}</el-descriptions-item>
      <el-descriptions-item label="当前领用人" :span="2">
        <div v-if="row?.status === 'ASSIGNED'">
          <div class="strong">{{ row?.employee_name || '-' }}</div>
          <div class="subtle">{{ row?.employee_no || '-' }} · {{ row?.department || '-' }}</div>
        </div>
        <span v-else>-</span>
      </el-descriptions-item>
      <el-descriptions-item label="更新时间">{{ row?.updated_at || '-' }}</el-descriptions-item>
      <el-descriptions-item label="ID">{{ row?.id || '-' }}</el-descriptions-item>
      <el-descriptions-item v-if="Number(row?.archived || 0) === 1" label="归档记录" :span="2">
        <div class="remark">原因：{{ row?.archived_reason || '未填写' }}</div>
        <div class="subtle">归档人：{{ row?.archived_by || '-' }} · 归档时间：{{ row?.archived_at || '-' }}</div>
        <div v-if="row?.archived_note" class="remark">备注：{{ row?.archived_note }}</div>
      </el-descriptions-item>
      <el-descriptions-item label="备注" :span="2">
        <div class="remark">{{ row?.remark || '-' }}</div>
      </el-descriptions-item>
    </el-descriptions>

    <template #footer>
      <el-button type="primary" plain @click="emit('view-audit')">查看审计历史</el-button>
      <el-button @click="emit('update:visible', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean;
  row: Record<string, any> | null;
  locationText: (row: any) => string;
  statusText: (status: string) => string;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  'view-audit': [];
}>();

function statusTagType(status: string) {
  if (status === 'IN_STOCK') return 'success';
  if (status === 'ASSIGNED') return 'warning';
  if (status === 'RECYCLED') return 'info';
  if (status === 'SCRAPPED') return 'danger';
  return 'info';
}
</script>

<style scoped>
.strong { font-weight: 600; }
.subtle { color: #999; font-size: 12px; }
.remark { white-space: pre-wrap; }
</style>
