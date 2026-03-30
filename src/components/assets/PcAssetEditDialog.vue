<template>
  <el-drawer
    :model-value="visible"
    class="ledger-drawer"
    size="640px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <template #header>
      <div class="ledger-drawer__intro">
        <div class="ledger-drawer__eyebrow">PC ASSET</div>
        <div class="ledger-drawer__title">{{ mode === 'create' ? '新增电脑台账' : '编辑电脑台账' }}</div>
        <div class="ledger-drawer__desc">统一使用右侧抽屉处理台账录入与修改，减少跳转打断，保持 B 端中后台操作连续性。</div>
      </div>
    </template>

    <div class="ledger-drawer__body">
      <section class="ledger-form-section">
        <div class="ledger-form-section__title">设备基础信息</div>
        <el-form :model="form" label-position="top" class="ledger-form-grid">
          <el-form-item label="品牌" class="ledger-form-grid__item">
            <el-select v-model="form.brand" filterable allow-create default-first-option clearable placeholder="请选择或输入品牌">
              <el-option v-for="item in brandOptions" :key="item" :label="item" :value="item" />
            </el-select>
          </el-form-item>
          <el-form-item label="型号" class="ledger-form-grid__item">
            <el-input v-model="form.model" placeholder="请输入型号" />
          </el-form-item>
          <el-form-item label="序列号" class="ledger-form-grid__item ledger-form-grid__item--full">
            <el-input v-model="form.serial_no" placeholder="请输入序列号" />
          </el-form-item>
          <el-form-item label="出厂时间" class="ledger-form-grid__item">
            <el-input v-model="form.manufacture_date" placeholder="YYYY-MM-DD" />
          </el-form-item>
          <el-form-item label="保修到期" class="ledger-form-grid__item">
            <el-input v-model="form.warranty_end" placeholder="YYYY-MM-DD" />
          </el-form-item>
        </el-form>
      </section>

      <section class="ledger-form-section">
        <div class="ledger-form-section__title">配置与备注</div>
        <el-form :model="form" label-position="top" class="ledger-form-grid">
          <el-form-item label="硬盘容量" class="ledger-form-grid__item">
            <el-input v-model="form.disk_capacity" placeholder="例如 512G / 1TB" />
          </el-form-item>
          <el-form-item label="内存大小" class="ledger-form-grid__item">
            <el-input v-model="form.memory_size" placeholder="例如 16G / 32G" />
          </el-form-item>
          <el-form-item label="备注" class="ledger-form-grid__item ledger-form-grid__item--full">
            <el-input v-model="form.remark" type="textarea" :rows="4" placeholder="可补充设备说明、维修情况、特殊备注等" />
          </el-form-item>
        </el-form>
      </section>
    </div>

    <template #footer>
      <div class="ledger-drawer__footer">
        <el-button @click="emit('update:visible', false)">取消</el-button>
        <el-button type="primary" :loading="saving" @click="emit('save')">保存</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { withDefaults } from 'vue';

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
</script>
