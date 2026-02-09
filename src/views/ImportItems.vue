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
import { ElMessage, ElMessageBox } from "element-plus";
import { exportTemplateItems } from "../utils/excel";
import * as XLSX from "xlsx";
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
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" }) as any[][];

    const headerRow = (aoa?.[0] || []).map((x) => String(x ?? "").trim());
    const norm = (v: any) => String(v ?? "").trim().toLowerCase();
    const headerNorm = headerRow.map(norm);

    const findCol = (aliases: string[]) => {
      const aliasNorm = aliases.map(norm);
      const idx = headerNorm.findIndex((h) => aliasNorm.includes(h));
      return idx >= 0 ? idx : null;
    };

    const colSku = findCol(["SKU", "sku", "配件", "物料编码", "物料"]);
    const colName = findCol(["名称", "name"]);
    const colBrand = findCol(["品牌", "brand"]);
    const colModel = findCol(["型号", "model"]);
    const colCategory = findCol(["分类", "category"]);
    const colUnit = findCol(["单位", "unit"]);
    const colWarn = findCol(["预警值", "warning_qty", "warning"]);

    const missing: string[] = [];
    if (colSku === null) missing.push("SKU");
    if (colName === null) missing.push("名称");
    if (missing.length) {
      ElMessageBox.alert(
        `表头缺少必需列：${missing.join("、")}。

请使用模板第一行表头：SKU、名称、品牌、型号、分类、单位、预警值（大小写不敏感）`,
        "读取失败",
        { type: "error" }
      );
      preview.value = [];
      return;
    }

    const mapped: Row[] = [];
    const errors: Array<{ row: number; col: string; msg: string; val?: any }> = [];

    for (let i = 1; i < aoa.length; i++) {
      const r = aoa[i] || [];
      const sku = String(r[colSku!] ?? "").trim();
      const name = String(r[colName!] ?? "").trim();
      const brand = colBrand !== null ? String(r[colBrand] ?? "").trim() : "";
      const modelV = colModel !== null ? String(r[colModel] ?? "").trim() : "";
      const category = colCategory !== null ? String(r[colCategory] ?? "").trim() : "";
      const unit = colUnit !== null ? String(r[colUnit] ?? "").trim() : "";
      const warnRaw = colWarn !== null ? String(r[colWarn] ?? "").trim() : "";

      const anyFilled = sku || name || brand || modelV || category || unit || warnRaw;
      if (!anyFilled) continue;

      if (!sku) errors.push({ row: i + 1, col: "SKU", msg: "必填" });
      if (!name) errors.push({ row: i + 1, col: "名称", msg: "必填" });

      let warning_qty = 0;
      if (warnRaw) {
        const n = Number(warnRaw);
        if (Number.isNaN(n)) errors.push({ row: i + 1, col: "预警值", msg: "格式不对（应为数字）", val: warnRaw });
        else warning_qty = n;
      }

      if (!sku || !name) continue; // invalid row is skipped from preview/import

      mapped.push({
        sku,
        name,
        brand: brand || undefined,
        model: modelV || undefined,
        category: category || undefined,
        unit: unit || undefined,
        warning_qty,
      });
    }

    preview.value = mapped.slice(0, 2000);

    if (!preview.value.length) {
      ElMessage.warning("没有读取到可导入的数据（请确认表头正确，且至少有一行 SKU/名称）");
      return;
    }

    if (errors.length) {
      const previewErr = errors
        .slice(0, 12)
        .map((x) => `第${x.row}行【${x.col}】${x.msg}${x.val !== undefined ? `（当前：${String(x.val)}）` : ""}`)
        .join("<br/>");
      ElMessageBox.alert(
        `<div style="line-height:1.8">已读取 ${preview.value.length} 行（最多预览 2000）。发现 <b>${errors.length}</b> 处问题：<br/>${previewErr}${
          errors.length > 12 ? "<br/>…（仅展示前 12 条）" : ""
        }<br/><br/>缺少必填字段/格式不正确的行已跳过，请修正 Excel 后重新导入。</div>`,
        "导入提示",
        { type: "warning", dangerouslyUseHTMLString: true }
      );
    } else {
      ElMessage.success(`已读取 ${preview.value.length} 行（最多预览 2000）`);
    }
  } catch (e:any) {
    ElMessage.error("读取失败：" + (e.message || ""));
  }
}

function downloadTemplate() {
  exportTemplateItems();
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
