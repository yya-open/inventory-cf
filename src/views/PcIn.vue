<template>
  <el-card>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" style="max-width: 620px">
      <el-alert
        title="电脑入库（仓库2：电脑仓）"
        type="info"
        show-icon
        :closable="false"
        style="margin-bottom: 12px"
      />

      <el-form-item label="品牌" prop="brand">
        <el-input v-model="form.brand" placeholder="例如：Lenovo / Dell / HP" />
      </el-form-item>

      <el-form-item label="序列号" prop="serial_no">
        <el-input v-model="form.serial_no" placeholder="SN / 序列号（唯一）" />
      </el-form-item>

      <el-form-item label="型号" prop="model">
        <el-input v-model="form.model" placeholder="例如：ThinkPad T14 Gen 4" />
      </el-form-item>

      <el-form-item label="出厂时间">
        <el-date-picker v-model="form.manufacture_date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
      </el-form-item>

      <el-form-item label="保修到期">
        <el-date-picker v-model="form.warranty_end" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
      </el-form-item>

      <el-form-item label="硬盘容量">
        <el-input v-model="form.disk_capacity" placeholder="例如：512G / 1T" />
      </el-form-item>

      <el-form-item label="内存大小">
        <el-input v-model="form.memory_size" placeholder="例如：16G / 32G" />
      </el-form-item>

      <el-form-item label="备注">
        <el-input v-model="form.remark" type="textarea" :rows="3" />
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :disabled="!canSubmit" @click="submit" :loading="submitting">入库</el-button>
        <el-button @click="$router.push('/pc/assets')">返回台账</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import { apiPost } from "../api/client";

const formRef = ref<FormInstance>();

const form = ref({
  brand: "",
  serial_no: "",
  model: "",
  manufacture_date: "" as string | "",
  warranty_end: "" as string | "",
  disk_capacity: "",
  memory_size: "",
  remark: "",
});

const rules: FormRules = {
  brand: [{ required: true, message: "请输入品牌", trigger: "blur" }],
  serial_no: [{ required: true, message: "请输入序列号", trigger: "blur" }],
  model: [{ required: true, message: "请输入型号", trigger: "blur" }],
};

const submitting = ref(false);

const canSubmit = computed(() => {
  return !!form.value.brand.trim() && !!form.value.serial_no.trim() && !!form.value.model.trim() && !submitting.value;
});

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;

  submitting.value = true;
  try {
    const r: any = await apiPost("/api/pc-in", { ...form.value });
    ElMessage.success(r?.created ? "入库成功（已新增资产）" : "入库成功（已更新资产）");
    // keep brand/model for convenience; clear serial and optional fields
    form.value.serial_no = "";
    form.value.manufacture_date = "";
    form.value.warranty_end = "";
    form.value.disk_capacity = "";
    form.value.memory_size = "";
    form.value.remark = "";
    formRef.value?.clearValidate();
  } catch (e: any) {
    ElMessage.error(e?.message || "入库失败");
  } finally {
    submitting.value = false;
  }
}
</script>
