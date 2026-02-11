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

      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:12px">
        <el-button size="small" @click="downloadInTemplate">下载导入模板</el-button>

        <el-upload
          :show-file-list="false"
          :auto-upload="false"
          accept=".xlsx,.xls"
          :on-change="onImportFile"
        >
          <el-button size="small" type="primary">Excel导入（批量入库）</el-button>
        </el-upload>
      </div>


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
import { parseXlsx, downloadTemplate } from "../utils/excel";
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



function downloadInTemplate() {
  downloadTemplate({
    filename: "电脑入库导入模板.xlsx",
    headers: [
      { title: "品牌" },
      { title: "序列号" },
      { title: "型号" },
      { title: "出厂时间" },
      { title: "保修到期" },
      { title: "硬盘容量" },
      { title: "内存大小" },
      { title: "备注" },
    ],
    exampleRows: [
      {
        "品牌": "Dell",
        "序列号": "SN123456",
        "型号": "Latitude 5440",
        "出厂时间": "2024-01-01",
        "保修到期": "2027-01-01",
        "硬盘容量": "512G",
        "内存大小": "16G",
        "备注": "示例，可删除该行",
      },
    ],
  });
}

async function onImportFile(uploadFile: any) {
  const file: File = uploadFile?.raw;
  if (!file) return;
  try {
    const rows = await parseXlsx(file);
    const items = rows
      .map((r) => ({
        brand: String(r["品牌"] ?? r["brand"] ?? "").trim(),
        serial_no: String(r["序列号"] ?? r["serial_no"] ?? "").trim(),
        model: String(r["型号"] ?? r["model"] ?? "").trim(),
        manufacture_date: String(r["出厂时间"] ?? r["manufacture_date"] ?? "").trim(),
        warranty_end: String(r["保修到期"] ?? r["warranty_end"] ?? "").trim(),
        disk_capacity: String(r["硬盘容量"] ?? r["disk_capacity"] ?? "").trim(),
        memory_size: String(r["内存大小"] ?? r["memory_size"] ?? "").trim(),
        remark: String(r["备注"] ?? r["remark"] ?? "").trim(),
      }))
      .filter((x) => x.brand || x.serial_no || x.model);

    if (!items.length) {
      ElMessage.warning("Excel里没有可导入的数据");
      return;
    }

    const res: any = await apiPost("/api/pc-in-batch", { items });
    const failed = Number(res?.failed || 0);
    if (failed > 0) {
      ElMessage.warning(`导入完成：成功 ${res.success} 条，失败 ${failed} 条（请查看控制台/接口返回 errors）`);
      console.warn("pc-in-batch errors", res?.errors);
    } else {
      ElMessage.success(`导入完成：成功 ${res.success} 条`);
    }

    await loadAssets();
  } catch (e: any) {
    ElMessage.error(e?.message || "导入失败");
  }
}

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
