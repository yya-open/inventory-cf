<template>
  <el-card>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" style="max-width: 760px">
      <el-alert
        title="电脑出库（仓库2：电脑仓）"
        type="warning"
        show-icon
        :closable="false"
        style="margin-bottom: 12px"
      />

      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:12px">
        <el-button size="small" @click="downloadOutTemplate">下载导入模板</el-button>

        <el-upload
          :show-file-list="false"
          :auto-upload="false"
          accept=".xlsx,.xls"
          :on-change="onImportOutFile"
        >
          <el-button size="small" type="primary">Excel导入（批量出库）</el-button>
        </el-upload>
      </div>


      <el-form-item label="选择电脑" prop="asset_id">
        <el-select
          v-model="form.asset_id"
          filterable
          remote
          :remote-method="remoteSearch"
          :loading="assetLoading"
          placeholder="输入序列号/品牌/型号搜索（仅显示在库）"
          style="width: 100%"
          @change="onPickAsset"
          clearable
        >
          <el-option
            v-for="a in assetOptions"
            :key="a.id"
            :label="`${a.serial_no} · ${a.brand} ${a.model}`"
            :value="a.id"
          />
        </el-select>
        <div style="margin-top:6px; color:#999; font-size:12px">
          没有找到？请先到「电脑入库」把电脑录入。
        </div>
      </el-form-item>

      <el-divider content-position="left">员工信息</el-divider>

      <el-form-item label="员工工号" prop="employee_no">
        <el-input v-model="form.employee_no" />
      </el-form-item>

      <el-form-item label="部门" prop="department">
        <el-input v-model="form.department" />
      </el-form-item>

      <el-form-item label="员工姓名" prop="employee_name">
        <el-input v-model="form.employee_name" />
      </el-form-item>

      <el-form-item label="是否在职" prop="is_employed">
        <el-radio-group v-model="form.is_employed">
          <el-radio-button label="在职" />
          <el-radio-button label="离职" />
        </el-radio-group>
      </el-form-item>

      <el-divider content-position="left">电脑信息（自动带出，可修改备注/日期）</el-divider>

      <el-descriptions v-if="pickedAsset" :column="2" border style="margin-bottom:12px">
        <el-descriptions-item label="品牌">{{ pickedAsset.brand }}</el-descriptions-item>
        <el-descriptions-item label="型号">{{ pickedAsset.model }}</el-descriptions-item>
        <el-descriptions-item label="序列号">{{ pickedAsset.serial_no }}</el-descriptions-item>
        <el-descriptions-item label="当前状态">
          <el-tag type="success" v-if="pickedAsset.status==='IN_STOCK'">在库</el-tag>
          <el-tag type="warning" v-else-if="pickedAsset.status==='ASSIGNED'">已领用</el-tag>
          <el-tag type="info" v-else>已回收</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="出厂时间">{{ pickedAsset.manufacture_date || "-" }}</el-descriptions-item>
        <el-descriptions-item label="保修到期">{{ pickedAsset.warranty_end || "-" }}</el-descriptions-item>
        <el-descriptions-item label="硬盘容量">{{ pickedAsset.disk_capacity || "-" }}</el-descriptions-item>
        <el-descriptions-item label="内存大小">{{ pickedAsset.memory_size || "-" }}</el-descriptions-item>
      </el-descriptions>

      <el-form-item label="配置日期">
        <el-date-picker v-model="form.config_date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.remark" type="textarea" :rows="3" />
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :disabled="!canSubmit" @click="submit" :loading="submitting">出库</el-button>
        <el-button @click="$router.push('/pc/assets')">返回台账</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { parseXlsx, downloadTemplate } from "../utils/excel";
import type { FormInstance, FormRules } from "element-plus";
import { apiGet, apiPost } from "../api/client";

const formRef = ref<FormInstance>();

const form = ref({
  asset_id: undefined as number | undefined,
  employee_no: "",
  department: "",
  employee_name: "",
  is_employed: "在职",
  config_date: "" as string | "",
  remark: "",
});

const rules: FormRules = {
  asset_id: [{ required: true, message: "请选择电脑", trigger: "change" }],
  employee_no: [{ required: true, message: "请输入员工工号", trigger: "blur" }],
  department: [{ required: true, message: "请输入部门", trigger: "blur" }],
  employee_name: [{ required: true, message: "请输入员工姓名", trigger: "blur" }],
  is_employed: [{ required: true, message: "请选择是否在职", trigger: "change" }],
};

const assetOptions = ref<any[]>([]);
const pickedAsset = ref<any | null>(null);
const assetLoading = ref(false);

async function loadAssets(keyword = "") {
  assetLoading.value = true;
  try {
    const params = new URLSearchParams();
    params.set("status", "IN_STOCK");
    params.set("page", "1");
    params.set("page_size", "50");
    if (keyword) params.set("keyword", keyword);
    const r: any = await apiGet(`/api/pc-assets?${params.toString()}`);
    assetOptions.value = r.data || [];
  } catch (e: any) {
    // ignore
  } finally {
    assetLoading.value = false;
  }
}

let tmr: any = null;
function remoteSearch(q: string) {
  if (tmr) clearTimeout(tmr);
  tmr = setTimeout(() => loadAssets(String(q || "").trim()), 250);
}

function onPickAsset(id: number) {
  const a = assetOptions.value.find((x: any) => Number(x.id) === Number(id));
  pickedAsset.value = a || null;
}

const submitting = ref(false);

const canSubmit = computed(() => {
  return (
    !!form.value.asset_id &&
    !!form.value.employee_no.trim() &&
    !!form.value.department.trim() &&
    !!form.value.employee_name.trim() &&
    !!String(form.value.is_employed || "").trim() &&
    !submitting.value
  );
});

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;

  submitting.value = true;
  try {
    const r: any = await apiPost("/api/pc-out", { ...form.value });
    ElMessage.success("出库成功");

    // 清理员工信息，保留是否在职默认值
    form.value.asset_id = undefined;
    pickedAsset.value = null;
    form.value.employee_no = "";
    form.value.department = "";
    form.value.employee_name = "";
    form.value.is_employed = "在职";
    form.value.config_date = "";
    form.value.remark = "";
    formRef.value?.clearValidate();
    // 重新拉取在库列表
    await loadAssets();
  } catch (e: any) {
    ElMessage.error(e?.message || "出库失败");
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  await loadAssets();
});
</script>
