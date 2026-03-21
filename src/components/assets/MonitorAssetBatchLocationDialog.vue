<template>
  <el-dialog v-model="visibleModel" title="批量修改显示器位置" width="420px">
    <el-form label-width="90px">
      <el-form-item label="目标位置">
        <el-select v-model="valueModel" clearable style="width:100%" placeholder="请选择位置">
          <el-option v-for="item in locationOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <div class="batch-preview">
        <el-tag>已选 {{ preview.total }} 台</el-tag>
        <el-tag type="success">预计生效 {{ preview.eligible }} 台</el-tag>
        <el-tag v-if="preview.sameLocation" type="info">位置相同 {{ preview.sameLocation }} 台</el-tag>
        <el-tag v-if="preview.archived" type="warning">已归档 {{ preview.archived }} 台</el-tag>
      </div>
      <div class="batch-help">将对当前已选显示器中“未归档且位置不同”的记录生效。</div>
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
  (e: 'update:value', value: number | ''): void;
  (e: 'submit'): void;
}>();
const props = defineProps<{
  visible: boolean;
  loading: boolean;
  value: number | '';
  locationOptions: Array<{ value: number | string; label: string }>;
  preview: { total: number; eligible: number; sameLocation?: number; archived?: number };
}>();

const visibleModel = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
});
const valueModel = computed({
  get: () => props.value,
  set: (value: number | '') => emit('update:value', value),
});
</script>
