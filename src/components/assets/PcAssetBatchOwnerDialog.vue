<template>
  <el-dialog v-model="visibleModel" title="批量修改电脑领用人" width="420px">
    <el-form label-width="90px">
      <el-form-item label="领用人">
        <el-input v-model="form.employee_name" placeholder="请输入领用人姓名" />
      </el-form-item>
      <el-form-item label="工号">
        <el-input v-model="form.employee_no" placeholder="可选" />
      </el-form-item>
      <el-form-item label="部门">
        <el-select v-model="form.department" filterable allow-create default-first-option clearable style="width:100%" placeholder="可选">
          <el-option v-for="item in departmentOptions" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>
      <div class="batch-preview">
        <el-tag>已选 {{ preview.total }} 台</el-tag>
        <el-tag type="success">预计生效 {{ preview.eligible }} 台</el-tag>
        <el-tag v-if="preview.unassigned" type="info">未领用 {{ preview.unassigned }} 台</el-tag>
        <el-tag v-if="preview.archived" type="warning">已归档 {{ preview.archived }} 台</el-tag>
        <el-tag v-if="preview.sameOwner" type="info">信息相同 {{ preview.sameOwner }} 台</el-tag>
      </div>
      <div class="batch-help">仅对当前已领用且领用信息发生变化的电脑生效，未领用电脑会自动跳过。</div>
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
  (e: 'submit'): void;
}>();
const props = defineProps<{
  visible: boolean;
  loading: boolean;
  form: { employee_name: string; employee_no: string; department: string };
  preview: { total: number; eligible: number; unassigned?: number; archived?: number; sameOwner?: number };
  departmentOptions: string[];
}>();

const visibleModel = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
});
</script>
