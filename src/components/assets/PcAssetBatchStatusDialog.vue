<template>
  <el-dialog v-model="visibleModel" title="批量修改电脑状态" width="420px">
    <el-form label-width="90px">
      <el-form-item label="目标状态">
        <el-select v-model="statusModel" style="width:100%">
          <el-option label="在库" value="IN_STOCK" />
          <el-option label="已回收" value="RECYCLED" />
          <el-option label="已报废" value="SCRAPPED" />
        </el-select>
      </el-form-item>
      <div class="batch-preview">
        <el-tag>已选 {{ preview.total }} 台</el-tag>
        <el-tag type="success">预计生效 {{ preview.eligible }} 台</el-tag>
        <el-tag v-if="preview.sameStatus" type="info">状态相同 {{ preview.sameStatus }} 台</el-tag>
        <el-tag v-if="preview.archived" type="warning">已归档 {{ preview.archived }} 台</el-tag>
      </div>
      <div class="batch-help">将对当前已选电脑中“未归档且状态不同”的记录生效。</div>
    </el-form>
    <template #footer>
      <el-button @click="visibleModel = false">取消</el-button>
      <el-button type="primary" :loading="loading" @click="$emit('submit')">确认</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'update:value', value: string): void;
  (e: 'submit'): void;
}>();
const props = defineProps<{
  visible: boolean;
  loading: boolean;
  value: string;
  preview: { total: number; eligible: number; sameStatus?: number; archived?: number };
}>();

const visibleModel = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
});
const statusModel = computed({
  get: () => props.value,
  set: (value: string) => emit('update:value', value),
});
</script>
