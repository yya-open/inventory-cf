<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    width="520px"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="asset-meta">
      {{ asset?.asset_code }} {{ asset?.sn ? ' / ' + asset.sn : '' }}
    </div>
    <el-form label-width="90px">
      <template v-if="kind === 'out'">
        <el-form-item label="工号">
          <el-input
            v-model="form.employee_no"
            :disabled="submitting"
            placeholder="请输入领用人工号"
          />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input
            v-model="form.employee_name"
            :disabled="submitting"
            placeholder="请输入领用人姓名"
          />
        </el-form-item>
        <el-form-item label="部门">
          <el-input
            v-model="form.department"
            :disabled="submitting"
            placeholder="请输入领用部门"
          />
        </el-form-item>
      </template>
      <el-form-item :label="locationLabel">
        <el-select
          v-model="form.location_id"
          filterable
          clearable
          :disabled="submitting"
          style="width: 100%"
          :placeholder="locationPlaceholder"
        >
          <el-option
            v-for="it in locationOptions"
            :key="it.value"
            :label="it.label"
            :value="it.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="备注">
        <el-input
          v-model="form.remark"
          :disabled="submitting"
          type="textarea"
          :rows="3"
          placeholder="可选，补充说明本次操作"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button
        :disabled="submitting"
        @click="emit('update:visible', false)"
      >
        取消
      </el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="submitDisabled"
        @click="emit('submit')"
      >
        提交
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  visible: boolean;
  title: string;
  kind: 'in' | 'out' | 'return' | 'transfer';
  asset: Record<string, any> | null;
  form: Record<string, any>;
  locationOptions: Array<{ value: number; label: string }>;
  submitting: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  submit: [];
}>();

const locationLabel = computed(() => {
  if (props.kind === 'transfer') return '目标位置';
  if (props.kind === 'return') return '归还位置';
  if (props.kind === 'out') return '出库位置';
  return '入库位置';
});

const locationPlaceholder = computed(() => {
  if (props.kind === 'transfer') return '请选择目标位置';
  if (props.kind === 'out') return '可选，建议填写领用后位置';
  if (props.kind === 'return') return '可选，建议填写归还后位置';
  return '可选，建议填写入库位置';
});

const submitDisabled = computed(() => {
  if (props.submitting) return true;
  if (props.kind === 'transfer') return !props.form.location_id;
  return false;
});
</script>

<style scoped>
.asset-meta {
  margin-bottom: 8px;
  color: #666;
}
</style>
