<template>
  <el-dialog v-model="visibleModel" title="批量归档电脑" width="460px">
    <el-form label-width="90px">
      <el-form-item label="归档原因">
        <el-select v-model="form.reason" style="width:100%" placeholder="请选择归档原因" filterable allow-create default-first-option>
          <el-option v-for="item in archiveReasonOptions" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.note" type="textarea" :rows="3" placeholder="可选，补充归档说明" />
      </el-form-item>
      <div class="batch-preview">
        <el-tag>已选 {{ preview.total }} 台</el-tag>
        <el-tag type="success">预计归档 {{ preview.eligible }} 台</el-tag>
        <el-tag v-if="preview.archived" type="info">已归档 {{ preview.archived }} 台</el-tag>
      </div>
      <div class="batch-help">归档后默认列表将不再显示，可通过“显示已归档”查看并恢复。</div>
    </el-form>
    <template #footer>
      <el-button @click="visibleModel = false">取消</el-button>
      <el-button type="primary" :loading="loading" @click="$emit('submit')">确认归档</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'submit'): void;
}>();
const props = defineProps<{
  visible: boolean;
  loading: boolean;
  form: { reason: string; note: string };
  preview: { total: number; eligible: number; archived?: number };
  archiveReasonOptions: string[];
}>();

const visibleModel = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
});
</script>
