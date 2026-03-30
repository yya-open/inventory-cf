<template>
  <el-drawer
    :model-value="visible"
    class="ledger-drawer"
    size="660px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <template #header>
      <div class="ledger-drawer__intro">
        <div class="ledger-drawer__eyebrow">PC ASSET</div>
        <div class="ledger-drawer__title">{{ mode === 'create' ? '新增电脑台账' : '编辑电脑台账' }}</div>
        <div class="ledger-drawer__desc">统一用右侧抽屉维护台账信息，表单结构、校验规则与详情页字段保持同一套后台规范。</div>
      </div>
    </template>

    <div class="ledger-drawer__body">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="ledger-form-stack" status-icon>
        <section class="ledger-form-section">
          <div class="ledger-form-section__head">
            <div class="ledger-form-section__title">设备基础信息</div>
            <div class="ledger-form-section__desc">优先保证品牌、型号、序列号与保修信息完整，避免后续领用、盘点与审计时字段缺失。</div>
          </div>
          <div class="ledger-form-grid">
            <el-form-item label="品牌" prop="brand" class="ledger-form-grid__item">
              <el-select v-model="form.brand" filterable allow-create default-first-option clearable placeholder="请选择或输入品牌">
                <el-option v-for="item in brandOptions" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
            <el-form-item label="型号" prop="model" class="ledger-form-grid__item">
              <el-input v-model="form.model" placeholder="请输入型号" />
            </el-form-item>
            <el-form-item label="序列号" prop="serial_no" class="ledger-form-grid__item ledger-form-grid__item--full">
              <el-input v-model="form.serial_no" placeholder="请输入序列号" />
            </el-form-item>
            <el-form-item label="出厂时间" prop="manufacture_date" class="ledger-form-grid__item">
              <el-input v-model="form.manufacture_date" placeholder="YYYY-MM-DD" />
            </el-form-item>
            <el-form-item label="保修到期" prop="warranty_end" class="ledger-form-grid__item">
              <el-input v-model="form.warranty_end" placeholder="YYYY-MM-DD" />
            </el-form-item>
          </div>
        </section>

        <section class="ledger-form-section">
          <div class="ledger-form-section__head">
            <div class="ledger-form-section__title">配置与备注</div>
            <div class="ledger-form-section__desc">统一记录硬盘、内存和备注说明，方便后续出入库和配置核对。</div>
          </div>
          <div class="ledger-form-grid">
            <el-form-item label="硬盘容量" prop="disk_capacity" class="ledger-form-grid__item">
              <el-input v-model="form.disk_capacity" placeholder="例如 512G / 1TB" />
            </el-form-item>
            <el-form-item label="内存大小" prop="memory_size" class="ledger-form-grid__item">
              <el-input v-model="form.memory_size" placeholder="例如 16G / 32G" />
            </el-form-item>
            <el-form-item label="备注" prop="remark" class="ledger-form-grid__item ledger-form-grid__item--full">
              <el-input v-model="form.remark" type="textarea" :rows="4" placeholder="可补充设备说明、维修情况、特殊备注等" />
            </el-form-item>
          </div>
        </section>
      </el-form>
    </div>

    <template #footer>
      <div class="ledger-drawer__footer">
        <el-button @click="emit('update:visible', false)">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSubmit">保存</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus';
import { ref, withDefaults } from 'vue';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

withDefaults(defineProps<{
  visible: boolean;
  saving: boolean;
  form: Record<string, any>;
  brandOptions: string[];
  mode?: 'create' | 'edit';
}>(), {
  mode: 'edit',
});

const emit = defineEmits<{
  'update:visible': [boolean];
  save: [];
}>();

const formRef = ref<FormInstance>();

const rules: FormRules = {
  brand: [
    { required: true, message: '请填写品牌', trigger: 'blur' },
    { min: 1, max: 40, message: '品牌长度请控制在 40 个字符内', trigger: 'blur' },
  ],
  model: [
    { required: true, message: '请填写型号', trigger: 'blur' },
    { min: 1, max: 80, message: '型号长度请控制在 80 个字符内', trigger: 'blur' },
  ],
  serial_no: [
    { required: true, message: '请填写序列号', trigger: 'blur' },
    { min: 2, max: 80, message: '序列号长度请控制在 2-80 个字符内', trigger: 'blur' },
  ],
  manufacture_date: [{ validator: validateDate, trigger: 'blur' }],
  warranty_end: [{ validator: validateDate, trigger: 'blur' }],
  disk_capacity: [{ max: 40, message: '硬盘容量长度请控制在 40 个字符内', trigger: 'blur' }],
  memory_size: [{ max: 40, message: '内存大小长度请控制在 40 个字符内', trigger: 'blur' }],
  remark: [{ max: 200, message: '备注请控制在 200 个字符内', trigger: 'blur' }],
};

function validateDate(_rule: unknown, value: string, callback: (error?: Error) => void) {
  const text = String(value || '').trim();
  if (!text) return callback();
  if (!DATE_RE.test(text)) return callback(new Error('日期格式需为 YYYY-MM-DD'));
  callback();
}

async function handleSubmit() {
  const valid = await validate();
  if (!valid) return;
  emit('save');
}

async function validate() {
  if (!formRef.value) return true;
  try {
    await formRef.value.validate();
    return true;
  } catch {
    return false;
  }
}

defineExpose({ validate });
</script>
