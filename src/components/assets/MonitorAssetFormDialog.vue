<template>
  <el-dialog
    :model-value="visible"
    width="860px"
    top="6vh"
    destroy-on-close
    append-to-body
    align-center
    class="monitor-asset-form-dialog"
    :close-on-click-modal="true"
    :close-on-press-escape="true"
    :show-close="true"
    @close="handleCancel"
    @update:model-value="emit('update:visible', $event)"
  >
    <template #header>
      <div class="monitor-asset-form-dialog__header">
        <div>
          <div class="monitor-asset-form-dialog__eyebrow">MONITOR ASSET</div>
          <div class="monitor-asset-form-dialog__title">{{ mode === 'create' ? '新增显示器台账' : '编辑显示器台账' }}</div>
          <div class="monitor-asset-form-dialog__desc">填写设备基础信息后即可保存，品牌支持从显示器品牌字典里选择或直接输入。</div>
        </div>
      </div>
    </template>

    <div class="monitor-asset-form-dialog__sticky-actions">
      <el-button :disabled="saving" @click="handleCancel">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSubmit">{{ mode === 'create' ? '确定新增' : '确定保存' }}</el-button>
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="ledger-form-stack monitor-asset-form-dialog__form" status-icon scroll-to-error>
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
            <el-select v-model="form.brand" filterable allow-create default-first-option clearable placeholder="请选择或输入品牌" teleported>
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
            <el-select v-model="form.location_id" filterable clearable placeholder="可选" teleported>
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

    <template #footer>
      <div class="monitor-asset-form-dialog__footer">
        <div class="monitor-asset-form-dialog__hint">{{ mode === 'create' ? '确认信息无误后再新增台账' : '保存后会立即刷新当前列表' }}</div>
        <div class="monitor-asset-form-dialog__footer-actions">
          <el-button :disabled="saving" @click="handleCancel">取消</el-button>
          <el-button type="primary" :loading="saving" @click="handleSubmit">{{ mode === 'create' ? '确定新增' : '确定保存' }}</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus';
import { ref } from 'vue';

const SIZE_RE = /^\d+(\.\d{1,2})?(\s*寸)?$/;

const props = defineProps<{
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
  if (props.saving) return;
  emit('update:visible', false);
  emit('cancel');
}

const rules: FormRules = {
  asset_code: [
    { required: true, message: '请填写资产编号', trigger: 'blur' },
    { min: 1, max: 50, message: '资产编号长度请控制在 50 个字符内', trigger: 'blur' },
  ],
  brand: [
    { required: true, message: '请填写品牌', trigger: ['blur', 'change'] },
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
