<template>
  <div style="padding:16px">
    <el-card>
      <template #header>
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div style="font-weight:700">批量出入库</div>
          <div style="display:flex; gap:10px; align-items:center;">
            <el-select v-model="warehouseId" style="width:180px" placeholder="选择仓库">
              <el-option v-for="w in warehouses" :key="w.id" :label="w.name" :value="w.id" />
            </el-select>
            <el-button @click="downloadTemplate">下载模板</el-button>
            <el-upload :show-file-list="false" accept=".xlsx,.xls" :before-upload="beforeUpload">
              <el-button type="primary">导入 Excel</el-button>
            </el-upload>
          </div>
        </div>
      </template>

      <el-tabs v-model="mode">
        <el-tab-pane label="入库" name="IN" />
        <el-tab-pane label="出库" name="OUT" />
      </el-tabs>

      <div style="display:flex; gap:12px; margin-bottom:12px; flex-wrap:wrap;">
        <el-input v-if="mode==='IN'" v-model="headerSource" placeholder="来源（可选）" style="width:220px" />
        <el-input v-if="mode==='OUT'" v-model="headerTarget" placeholder="去向（可选）" style="width:220px" />
        <el-input v-model="headerRemark" placeholder="备注（可选）" style="width:320px" />
        <el-button @click="addRow">新增一行</el-button>
        <el-button type="danger" plain @click="clearRows">清空</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">提交</el-button>
      </div>

      <el-table :data="rows" border height="520">
        <el-table-column type="index" width="55" />
        <el-table-column label="SKU" min-width="160">
          <template #default="{ row }">
            <el-input v-model="row.sku" placeholder="例如: CPU-001" />
          </template>
        </el-table-column>
        <el-table-column label="数量" width="140">
          <template #default="{ row }">
            <el-input-number v-model="row.qty" :min="1" :controls="true" />
          </template>
        </el-table-column>

        <el-table-column v-if="mode==='IN'" label="单价" width="160">
          <template #default="{ row }">
            <el-input-number v-model="row.unit_price" :min="0" :step="0.1" :controls="true" />
          </template>
        </el-table-column>

        <el-table-column v-if="mode==='IN'" label="来源(覆盖)" min-width="160">
          <template #default="{ row }">
            <el-input v-model="row.source" placeholder="可不填" />
          </template>
        </el-table-column>

        <el-table-column v-if="mode==='OUT'" label="去向(覆盖)" min-width="160">
          <template #default="{ row }">
            <el-input v-model="row.target" placeholder="可不填" />
          </template>
        </el-table-column>

        <el-table-column label="备注(覆盖)" min-width="180">
          <template #default="{ row }">
            <el-input v-model="row.remark" placeholder="可不填" />
          </template>
        </el-table-column>

        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ $index }">
            <el-button size="small" type="danger" plain @click="rows.splice($index,1)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="margin-top:12px; color:#999; font-size:12px;">
        Excel 模板列：<b>sku</b>, <b>qty</b>, 入库可选：unit_price/source/remark；出库可选：target/remark
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import * as XLSX from "xlsx";
import { apiGet, apiPost } from "../api/client";

type Row = { sku: string; qty: number; unit_price?: number; source?: string; target?: string; remark?: string };

const mode = ref<"IN"|"OUT">("IN");
const warehouses = ref<any[]>([]);
const warehouseId = ref<number>(1);
const headerSource = ref("");
const headerTarget = ref("");
const headerRemark = ref("");
const rows = ref<Row[]>([]);
const submitting = ref(false);

function addRow() {
  rows.value.push({ sku: "", qty: 1 });
}
function clearRows() {
  rows.value = [];
}

async function loadWarehouses() {
  try {
    const r:any = await apiGet("/api/warehouses");
    if (r?.ok) {
    warehouses.value = r.data;
    if (warehouses.value?.length && !warehouses.value.find(w=>w.id===warehouseId.value)) warehouseId.value = warehouses.value[0].id;
    }
  } catch (e:any) {
    ElMessage.error(e?.message || "加载仓库失败");
  }
}

function downloadTemplate() {
  const header = mode.value === "IN"
    ? ["sku","qty","unit_price","source","remark"]
    : ["sku","qty","target","remark"];
  const ws = XLSX.utils.aoa_to_sheet([header]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "template");
  XLSX.writeFile(wb, `batch_${mode.value.toLowerCase()}_template.xlsx`);
}

function beforeUpload(file: File) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = new Uint8Array(e.target?.result as ArrayBuffer);
    const wb = XLSX.read(data, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });
    const parsed: Row[] = [];
    for (const r of json) {
      const sku = String(r.sku ?? r.SKU ?? r["Sku"] ?? "").trim();
      const qty = Number(r.qty ?? r.QTY ?? r["数量"] ?? 0);
      if (!sku || !qty || qty<=0) continue;
      const row: Row = { sku, qty };
      if (mode.value==="IN") {
        const p = Number(r.unit_price ?? r.price ?? r["单价"] ?? "");
        if (!Number.isNaN(p)) row.unit_price = p;
        const src = String(r.source ?? r["来源"] ?? "").trim();
        if (src) row.source = src;
      } else {
        const tgt = String(r.target ?? r["去向"] ?? "").trim();
        if (tgt) row.target = tgt;
      }
      const rm = String(r.remark ?? r["备注"] ?? "").trim();
      if (rm) row.remark = rm;
      parsed.push(row);
    }
    rows.value = rows.value.concat(parsed);
    ElMessage.success(`导入 ${parsed.length} 行`);
  };
  reader.readAsArrayBuffer(file);
  return false;
}

async function submit() {
  if (!rows.value.length) return ElMessage.warning("请先添加或导入明细");
  submitting.value = true;
  try {
    const payload: any = {
      warehouse_id: warehouseId.value,
      remark: headerRemark.value || null,
      lines: rows.value
    };
    if (mode.value==="IN") payload.source = headerSource.value || null;
    if (mode.value==="OUT") payload.target = headerTarget.value || null;

    const url = mode.value==="IN" ? "/api/batch/stock-in" : "/api/batch/stock-out";
    const r:any = await apiPost(url, payload);
    if (r?.ok) {
      ElMessage.success(`成功提交 ${r.count} 条（自动合并同 SKU）`);
      rows.value = [];
    } else {
      ElMessage.error(r.message || "提交失败");
    }
    } catch (e:any) {
    ElMessage.error(e?.message || "提交失败");
  } finally {
    submitting.value = false;
    }
  } catch (e:any) {
    ElMessage.error(e?.message || "加载仓库失败");
  }
}

onMounted(async ()=>{
  await loadWarehouses();
  addRow();
});
</script>
