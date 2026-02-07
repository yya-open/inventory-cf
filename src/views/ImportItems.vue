<template>
  <el-card>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px">
      <div>
        <span style="font-weight:700">Excel 导入配件</span>
        <span style="margin-left:10px; color:#999; font-size:12px">支持字段：SKU、名称、品牌、型号、分类、单位、预警值</span>
      </div>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
        <el-button @click="downloadTemplate">下载模板</el-button>
        <el-select v-model="mode" style="width: 200px">
          <el-option label="存在则更新（推荐）" value="upsert" />
          <el-option label="存在则跳过" value="skip" />
        </el-select>
        <el-upload :auto-upload="false" :show-file-list="false" accept=".xlsx,.xls" @change="onPick">
          <el-button type="primary">选择 Excel</el-button>
        </el-upload>
        <el-button type="success" :disabled="preview.length===0" :loading="uploading" @click="submit">导入</el-button>
      </div>
    </div>

    <el-alert type="info" show-icon style="margin-bottom:12px">
      Excel 第一行请使用表头：SKU、名称、品牌、型号、分类、单位、预警值（大小写不敏感）。
    </el-alert>

    <el-table :data="preview" border height="520">
      <el-table-column prop="sku" label="SKU" width="180" />
      <el-table-column prop="name" label="名称" min-width="180" />
      <el-table-column prop="brand" label="品牌" width="140" />
      <el-table-column prop="model" label="型号" width="140" />
      <el-table-column prop="category" label="分类" width="120" />
      <el-table-column prop="unit" label="单位" width="90" />
      <el-table-column prop="warning_qty" label="预警值" width="90" />
    </el-table>

    <el-dialog v-model="showResult" title="导入结果" width="520px">
      <div style="line-height: 1.9">
        <div>新增：<b>{{ result?.inserted || 0 }}</b></div>
        <div>更新：<b>{{ result?.updated || 0 }}</b></div>
        <div>跳过：<b>{{ result?.skipped || 0 }}</b></div>
        <div v-if="result?.errors?.length" style="margin-top:10px; color:#d33">
          有 {{ result.errors.length }} 条错误（缺少 SKU/名称），已跳过
        </div>
      </div>
      <template #footer>
        <el-button type="primary" @click="showResult=false">知道了</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { readFirstSheet, exportTemplateItems } from "../utils/excel";
import { apiPost } from "../api/client";

type Row = { sku:string; name:string; brand?:string; model?:string; category?:string; unit?:string; warning_qty?:number };

const preview = ref<Row[]>([]);
const mode = ref<"upsert"|"skip">("upsert");
const uploading = ref(false);

const showResult = ref(false);
const result = ref<any>(null);

function normKey(k: string) {
  return String(k || "").trim().toLowerCase();
}

function mapRow(r: any): Row {
  const keys = Object.keys(r || {});
  const get = (name: string) => {
    const k = keys.find(x => normKey(x) === normKey(name));
    return k ? r[k] : "";
  };
  return {
    sku: String(get("SKU") || get("sku") || "").trim(),
    name: String(get("名称") || get("name") || "").trim(),
    brand: String(get("品牌") || get("brand") || "").trim() || undefined,
    model: String(get("型号") || get("model") || "").trim() || undefined,
    category: String(get("分类") || get("category") || "").trim() || undefined,
    unit: String(get("单位") || get("unit") || "").trim() || undefined,
    warning_qty: Number(get("预警值") || get("warning_qty") || 0) || 0,
  };
}

async function onPick(uploadFile: any) {
  const file: File = uploadFile.raw;
  if (!file) return;
  try {
    const json = await readFirstSheet(file);
    const mapped = json.map(mapRow).filter(x => x.sku || x.name);
    preview.value = mapped.slice(0, 2000);
    ElMessage.success(`已读取 ${preview.value.length} 行（最多预览 2000）`);
  } catch (e:any) {
    ElMessage.error("读取失败：" + (e.message || ""));
  }
}

async function downloadTemplate() {
  try {
    await exportTemplateItems();
  } catch (e:any) {
    ElMessage.error(e?.message || "生成模板失败");
  }
}

async function submit() {
  if (!preview.value.length) return;
  uploading.value = true;
  try {
    const r = await apiPost<{ ok:boolean; data:any }>("/api/import/items", { items: preview.value, mode: mode.value });
    result.value = r.data;
    showResult.value = true;
    ElMessage.success("导入完成");
  } catch (e:any) {
    ElMessage.error(e.message || "导入失败");
  } finally {
    uploading.value = false;
  }
}
</script>
