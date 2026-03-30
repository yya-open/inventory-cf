<template>
  <el-drawer
    :model-value="visible"
    class="ledger-drawer"
    size="620px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <template #header>
      <div class="ledger-drawer__intro">
        <div class="ledger-drawer__eyebrow">MONITOR ASSET</div>
        <div class="ledger-drawer__title">{{ mode === 'create' ? '新增显示器台账' : '编辑显示器台账' }}</div>
        <div class="ledger-drawer__desc">把新增和编辑统一到抽屉表单里，录入时不打断列表上下文，适合 B 端连续作业。</div>
      </div>
    </template>

    <div class="ledger-drawer__body">
      <section class="ledger-form-section">
        <div class="ledger-form-section__title">设备基础信息</div>
        <el-form :model="form" label-position="top" class="ledger-form-grid">
          <el-form-item label="资产编号" class="ledger-form-grid__item">
            <el-input v-model="form.asset_code" placeholder="必填" />
          </el-form-item>
          <el-form-item label="SN" class="ledger-form-grid__item">
            <el-input v-model="form.sn" placeholder="可选" />
          </el-form-item>
          <el-form-item label="品牌" class="ledger-form-grid__item">
            <el-select v-model="form.brand" filterable allow-create default-first-option clearable placeholder="请选择或输入品牌">
              <el-option v-for="item in brandOptions" :key="item" :label="item" :value="item" />
            </el-select>
          </el-form-item>
          <el-form-item label="型号" class="ledger-form-grid__item">
            <el-input v-model="form.model" placeholder="请输入型号" />
          </el-form-item>
          <el-form-item label="尺寸" class="ledger-form-grid__item">
            <el-input v-model="form.size_inch" placeholder="例如 27" />
          </el-form-item>
          <el-form-item label="位置" class="ledger-form-grid__item">
            <el-select v-model="form.location_id" filterable clearable placeholder="可选">
              <el-option v-for="it in locationOptions" :key="it.value" :label="it.label" :value="it.value" />
            </el-select>
          </el-form-item>
        </el-form>
      </section>

      <section class="ledger-form-section">
        <div class="ledger-form-section__title">补充说明</div>
        <el-form :model="form" label-position="top">
          <el-form-item label="备注">
            <el-input v-model="form.remark" type="textarea" :rows="4" placeholder="可补充位置、异常情况、领用说明等" />
          </el-form-item>
        </el-form>
      </section>
    </div>

    <template #footer>
      <div class="ledger-drawer__footer">
        <el-button :disabled="saving" @click="emit('update:visible', false)">取消</el-button>
        <el-button type="primary" :loading="saving" @click="emit('save')">保存</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
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
}>();
</script>
