<template>
  <el-drawer
    :model-value="visible"
    class="ledger-drawer ledger-drawer--monitor-form"
    size="660px"
    destroy-on-close
    append-to-body
    show-close
    :close-on-click-modal="true"
    :close-on-press-escape="true"
    @close="handleCancel"
    @update:model-value="emit('update:visible', $event)"
  >
    <template #header>
      <div class="ledger-drawer__header-row">
        <div class="ledger-drawer__intro">
          <div class="ledger-drawer__eyebrow">MONITOR ASSET</div>
          <div class="ledger-drawer__title">{{ mode === 'create' ? '新增显示器台账' : '编辑显示器台账' }}</div>
          <div class="ledger-drawer__desc">把新增和编辑统一到抽屉表单里，字段分组、校验规则与详情页信息结构保持同一套后台规范。</div>
        </div>
      </div>
    </template>

    <div class="ledger-drawer__body">
      <div class="ledger-drawer__sticky-actions ledger-drawer__sticky-actions--monitor-form">
        <div class="ledger-drawer__sticky-hint">{{ mode === 'create' ? '填写完成后点击确定新增' : '编辑完成后点击确定保存' }}</div>
        <div class="ledger-drawer__footer-actions">
          <el-button class="ledger-drawer__ghost-btn ledger-drawer__ghost-btn--strong" :disabled="saving" @click="handleCancel">取消</el-button>
          <el-button class="ledger-drawer__primary-btn ledger-drawer__primary-btn--strong" type="primary" :loading="saving" @click="handleSubmit">{{ mode === 'create' ? '确定新增' : '确定保存' }}</el-button>
        </div>
      </div>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="ledger-form-stack" status-icon scroll-to-error>
        <section class="ledger-form-section">
          <div class="ledger-form-section__head">
            <div class="ledger-form-section__title">设备基础信息</div>
            <div class="ledger-form-section__desc">优先保证资产编号、品牌、型号等核心字段完整，方便后续位置管理、领用和审计追溯。</div>
          </div>
          <div class="ledger-form-grid">
            <el-form-item label="资产编号" prop="asset_code" class="ledger-form-grid__item">
              <el-input v-model="form.asset_code" placeholder="必填" />
            </el-form-item>
            <el-form-item label="SN" prop="sn" class="ledger-form-grid__item">
              <el-input v-model="form.sn" placeholder="可选" />
            </el-form-item>
            <el-form-item label="品牌" prop="brand" class="ledger-form-grid__item">
              <el-select v-model="form.brand" filterable allow-create default-first-option clearable placeholder="请选择或输入品牌">
                <el-option v-for="item in brandOptions" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
            <el-form-item label="型号" prop="model" class="ledger-form-grid__item">
              <el-input v-model="form.model" placeholder="请输入型号" />
            </el-form-item>
            <el-form-item label="尺寸" prop="size_inch" class="ledger-form-grid__item">
              <el-input v-model="form.size_inch" placeholder="例如 27 或 27寸" />
            </el-form-item>
            <el-form-item label="位置" prop="location_id" class="ledger-form-grid__item">
              <el-select v-model="form.location_id" filterable clearable placeholder="可选">
                <el-option v-for="it in locationOptions" :key="it.value" :label="it.label" :value="it.value" />
              </el-select>
            </el-form-item>
          </div>
        </section>

        <section class="ledger-form-section">
          <div class="ledger-form-section__head">
            <div class="ledger-form-section__title">补充说明</div>
            <div class="ledger-form-section__desc">记录特殊位置、异常说明或领用补充信息，便于后续协同处理。</div>
          </div>
          <el-form-item label="备注" prop="remark">
            <el-input v-model="form.remark" type="textarea" :rows="4" placeholder="可补充位置、异常情况、领用说明等" />
          </el-form-item>
        </section>
      </el-form>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus';
import { ref } from 'vue';

const SIZE_RE = /^\d+(\.\d{1,2})?(\s*寸)?$/;

defineProps<{
  visible: boolean;
  mode: 'create' | 'edit';
  form: Record<string, any>;
  locationOptions: Array<{ value: number; label: string }>;
  brandOptions: string[];
  saving: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  save: [];
  cancel: [];
}>();

const formRef = ref<FormInstance>();

function handleCancel() {
  if (saving) return;
  emit('cancel');
  emit('update:visible', false);
}

const rules: FormRules = {
  asset_code: [
    { required: true, message: '请填写资产编号', trigger: 'blur' },
    { min: 1, max: 50, message: '资产编号长度请控制在 50 个字符内', trigger: 'blur' },
  ],
  brand: [
    { required: true, message: '请填写品牌', trigger: 'blur' },
    { min: 1, max: 40, message: '品牌长度请控制在 40 个字符内', trigger: 'blur' },
  ],
  model: [
    { required: true, message: '请填写型号', trigger: 'blur' },
    { min: 1, max: 80, message: '型号长度请控制在 80 个字符内', trigger: 'blur' },
  ],
  sn: [{ max: 80, message: 'SN 长度请控制在 80 个字符内', trigger: 'blur' }],
  size_inch: [{ validator: validateSize, trigger: 'blur' }],
  remark: [{ max: 200, message: '备注请控制在 200 个字符内', trigger: 'blur' }],
};

function validateSize(_rule: unknown, value: string, callback: (error?: Error) => void) {
  const text = String(value || '').trim();
  if (!text) return callback();
  if (!SIZE_RE.test(text)) return callback(new Error('尺寸请填写数字或“27寸”这类格式'));
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
