<template>
  <div style="padding:16px">
    <el-card>
      <template #header>
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div style="font-weight:700">批量出入库</div>
          <div style="display:flex; gap:10px; align-items:center;">
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
        <el-input v-if="mode==='OUT'" v-model="headerTarget" placeholder="领用人/去向（必填，可被每行覆盖）" style="width:260px" />
        <el-input v-model="headerRemark" placeholder="备注（可选）" style="width:320px" />
        <el-button @click="addRow">新增一行</el-button>
        <el-button type="danger" plain @click="clearRows">清空</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">提交</el-button>
      </div>

      <el-table
        :data="rows"
        border
        height="520"
        :row-class-name="rowClass"
        :cell-class-name="cellClass"
      >
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

        <el-table-column v-if="mode==='OUT'" label="领用人(覆盖)" min-width="160">
          <template #default="{ row }">
            <el-input v-model="row.target" placeholder="不填则使用上方领用人" />
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

      <div v-if="invalidCount" style="margin-top:10px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <el-alert
          type="warning"
          :closable="false"
          show-icon
          style="flex:1; min-width:320px;"
          :title="`当前有 ${invalidCount} 行缺少必填字段，已标红（可直接在表格里补全或删除该行）。`"
        />
        <el-button size="small" @click="keepValidOnly">只保留有效行</el-button>
      </div>

      <div style="margin-top:12px; color:#999; font-size:12px;">
        Excel 模板列：<b>sku</b>, <b>qty</b>；入库可选：unit_price/source/remark；出库必填：<b>target</b>（可在表头填默认领用人）
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import * as XLSX from "xlsx";
import { apiGet, apiPost } from "../api/client";

type Row = { sku: string; qty: number; unit_price?: number; source?: string; target?: string; remark?: string };

const mode = ref<"IN" | "OUT">("IN");
const warehouses = ref<any[]>([]);
const warehouseId = ref<number>(1); // 配件仓固定主仓
const headerSource = ref("");
const headerTarget = ref("");
const headerRemark = ref("");
const rows = ref<Row[]>([]);
const submitting = ref(false);

function getRowIssues(r: Row) {
  const skuMissing = !String(r.sku || "").trim();
  const qtyNum = Number(r.qty);
  const qtyMissing = !qtyNum || qtyNum <= 0;
  const headerT = String(headerTarget.value || "").trim();
  const targetMissing =
    mode.value === "OUT" ? !String((r.target ?? "") || headerT).trim() : false;
  return { skuMissing, qtyMissing, targetMissing, any: skuMissing || qtyMissing || targetMissing };
}

const invalidCount = computed(() => rows.value.filter((r) => getRowIssues(r).any).length);

function keepValidOnly() {
  const before = rows.value.length;
  rows.value = rows.value.filter((r) => !getRowIssues(r).any);
  ElMessage.success(`已保留有效行：${rows.value.length} / ${before}`);
}

function rowClass({ row }: { row: Row }) {
  return getRowIssues(row).any ? "row-error" : "";
}

function cellClass({ row, column }: any) {
  const label = String(column?.label || "");
  const issues = getRowIssues(row);
  if (label === "SKU" && issues.skuMissing) return "cell-error";
  if (label === "数量" && issues.qtyMissing) return "cell-error";
  if (label.startsWith("领用人") && issues.targetMissing) return "cell-error";
  return "";
}

function addRow() {
  rows.value.push({ sku: "", qty: 1 });
}
function clearRows() {
  rows.value = [];
}

function downloadTemplate() {
  // 模板默认带示例，方便用户照填
  const header =
    mode.value === "IN"
      ? ["sku", "qty", "unit_price", "source", "remark"]
      : ["sku", "qty", "target", "remark"];

  const exampleRows =
    mode.value === "IN"
      ? [
          ["CPU-001", 10, 299.9, "京东", "示例：批量入库"],
          ["SSD-1T-NVME", 5, 499.0, "供应商A", "示例：可填写单价/来源/备注"],
        ]
      : [
          ["CPU-001", 1, "张三", "示例：批量出库"],
          ["SSD-1T-NVME", 2, "李四", "示例：领用人必填（也可用表头默认）"],
        ];

  const ws = XLSX.utils.aoa_to_sheet([header, ...exampleRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "template");
  XLSX.writeFile(wb, `batch_${mode.value.toLowerCase()}_template.xlsx`);
}

function beforeUpload(file: File) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
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

      // Required columns
      const colSku = findCol(["sku", "SKU", "Sku", "配件", "物料", "物料编码"]);
      const colQty = findCol(["qty", "QTY", "数量"]);
      const colTarget = findCol(["target", "领用人", "去向", "领用"]);
      const colUnitPrice = findCol(["unit_price", "price", "单价"]);
      const colSource = findCol(["source", "来源"]);
      const colRemark = findCol(["remark", "备注"]);

      const missing: string[] = [];
      if (colSku === null) missing.push("sku");
      if (colQty === null) missing.push("qty");
      if (mode.value === "OUT" && colTarget === null) missing.push("target");

      if (missing.length) {
        ElMessageBox.alert(
          `表头缺少必需列：${missing.join("、")}。

请使用模板第一行表头：
` +
            (mode.value === "IN"
              ? "sku, qty, unit_price(可选), source(可选), remark(可选)"
              : "sku, qty, target(必填), remark(可选)") +
            `

（大小写不敏感，也支持中文列名：数量/单价/来源/备注/领用人）`,
          "导入失败",
          { type: "error" }
        );
        return;
      }

      const parsed: Row[] = [];
      const errors: Array<{ row: number; col: string; msg: string; val?: any }> = [];

      const toNumber = (v: any) => {
        const s = String(v ?? "").trim();
        if (!s) return null;
        const n = Number(s);
        return Number.isNaN(n) ? NaN : n;
      };

      for (let i = 1; i < aoa.length; i++) {
        const r = aoa[i] || [];
        const sku = String(r[colSku!] ?? "").trim();
        const qtyRaw = r[colQty!];
        const qtyN = toNumber(qtyRaw);

        const unitPriceN = colUnitPrice !== null ? toNumber(r[colUnitPrice]) : null;
        const source = colSource !== null ? String(r[colSource] ?? "").trim() : "";
        const target = colTarget !== null ? String(r[colTarget] ?? "").trim() : "";
        const remark = colRemark !== null ? String(r[colRemark] ?? "").trim() : "";

        const anyFilled =
          !!sku ||
          String(qtyRaw ?? "").trim() !== "" ||
          (colUnitPrice !== null && String(r[colUnitPrice] ?? "").trim() !== "") ||
          (colSource !== null && source) ||
          (colTarget !== null && target) ||
          (colRemark !== null && remark);

        if (!anyFilled) continue;

        const rowObj: Row = { sku, qty: 0 };

        // sku
        if (!sku) errors.push({ row: i + 1, col: "SKU", msg: "必填" });

        // qty
        if (qtyN === null) {
          errors.push({ row: i + 1, col: "数量", msg: "必填", val: qtyRaw });
        } else if (Number.isNaN(qtyN)) {
          errors.push({ row: i + 1, col: "数量", msg: "格式不对（应为数字）", val: qtyRaw });
        } else if (qtyN <= 0) {
          errors.push({ row: i + 1, col: "数量", msg: "必须 > 0", val: qtyRaw });
        } else {
          rowObj.qty = qtyN;
        }

        if (mode.value === "IN") {
          if (unitPriceN !== null && !Number.isNaN(unitPriceN)) rowObj.unit_price = unitPriceN;
          if (source) rowObj.source = source;
        } else {
          // OUT: target required (can fallback to headerTarget)
          const headerT = String(headerTarget.value || "").trim();
          const finalTarget = String(target || headerT).trim();
          if (!finalTarget) errors.push({ row: i + 1, col: "领用人", msg: "必填（可填表头默认领用人）" });
          else rowObj.target = finalTarget;
        }

        if (remark) rowObj.remark = remark;

        parsed.push(rowObj);
      }

      if (!parsed.length) {
        ElMessage.warning("没有读取到有效数据（请确认第一行是表头，且后续有数据行）");
        return;
      }

      rows.value = rows.value.concat(parsed);

      if (errors.length) {
        const preview = errors
          .slice(0, 12)
          .map((x) => `第${x.row}行【${x.col}】${x.msg}${x.val !== undefined ? `（当前：${String(x.val)}）` : ""}`)
          .join("<br/>");
        ElMessageBox.alert(
          `<div style="line-height:1.8">导入 ${parsed.length} 行，发现 <b>${errors.length}</b> 处问题：<br/>${preview}${
            errors.length > 12 ? "<br/>…（仅展示前 12 条）" : ""
          }<br/><br/>已保留数据并在表格中标红，你可以直接补全/修正后再提交。</div>`,
          "导入提示",
          { type: "warning", dangerouslyUseHTMLString: true }
        );
      } else {
        ElMessage.success(`导入 ${parsed.length} 行`);
      }
    } catch (err: any) {
      ElMessage.error(err?.message || "读取失败");
    }
  };
  reader.readAsArrayBuffer(file);
  return false;
}

async function submit() {
  if (!rows.value.length) return ElMessage.warning("请先添加或导入明细");

  // Strict client-side validation
  const invalid: Array<{ idx: number; reason: string }> = [];
  const headerT = String(headerTarget.value || "").trim();
  rows.value.forEach((r, i) => {
    const sku = String(r.sku || "").trim();
    const qty = Number(r.qty);
    if (!sku) invalid.push({ idx: i + 1, reason: "配件(SKU)必填" });
    if (!qty || qty <= 0) invalid.push({ idx: i + 1, reason: "数量必填且>0" });
    if (mode.value === "OUT") {
      const t = String((r.target ?? "") || headerT).trim();
      if (!t) invalid.push({ idx: i + 1, reason: "领用人必填（可填表头默认领用人）" });
    }
  });
  if (mode.value === "OUT" && !headerT && rows.value.some((r) => !String(r.target || "").trim())) {
    // This branch keeps error messaging clearer when all rely on header
  }
  if (invalid.length) {
    const preview = invalid.slice(0, 6).map((x) => `第${x.idx}行：${x.reason}`).join("；");
    return ElMessage.error(invalid.length > 6 ? `${preview}…（共${invalid.length}处）` : preview);
  }

  submitting.value = true;
  try {
    const payload: any = {
      warehouse_id: warehouseId.value,
      remark: headerRemark.value || null,
      lines: rows.value,
    };
    if (mode.value === "IN") payload.source = headerSource.value || null;
    if (mode.value === "OUT") payload.target = headerT || null;

    const url = mode.value === "IN" ? "/api/batch/stock-in" : "/api/batch/stock-out";
    const r: any = await apiPost(url, payload);

    if (r?.ok) {
      ElMessage.success(`成功提交 ${r.count} 条（自动合并同 SKU）`);
      rows.value = [];
    } else {
      ElMessage.error(r?.message || "提交失败");
    }
  } catch (e) {
    const err: any = e;
    ElMessage.error(err?.message || "提交失败");
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {  addRow();
});
</script>

<style scoped>
.row-error {
  background: rgba(245, 108, 108, 0.06);
}
.cell-error {
  background: rgba(245, 108, 108, 0.08) !important;
}
.cell-error :deep(.el-input__wrapper),
.cell-error :deep(.el-textarea__inner),
.cell-error :deep(.el-input-number),
.cell-error :deep(.el-select__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-danger) inset !important;
}
</style>
