<template>
  <el-card>
    <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px">
      <el-select v-model="type" placeholder="类型" clearable style="width:140px">
        <el-option label="入库(IN)" value="IN" />
        <el-option label="出库(OUT)" value="OUT" />
      </el-select>

      <el-select v-model="item_id" filterable clearable placeholder="配件（可搜索）" style="width:320px">
        <el-option v-for="it in items" :key="it.id" :label="`${it.sku} · ${it.name}`" :value="it.id" />
      </el-select>

      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="到"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
      />

      <el-button type="primary" @click="load">查询</el-button>
      <el-button @click="reset">重置</el-button>
      <el-button type="success" plain @click="exportCsv" :disabled="rows.length===0">导出CSV</el-button>
    </div>

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="created_at" label="时间" width="170" />
      <el-table-column prop="tx_no" label="单号" width="190" />
      <el-table-column prop="type" label="类型" width="90">
        <template #default="{row}">
          <el-tag v-if="row.type==='IN'" type="success">IN</el-tag>
          <el-tag v-else-if="row.type==='OUT'" type="danger">OUT</el-tag>
          <el-tag v-else type="info">{{ row.type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="配件" min-width="260">
        <template #default="{row}">
          <div style="font-weight:600">{{ row.name }}</div>
          <div style="color:#999;font-size:12px">{{ row.sku }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="warehouse_name" label="仓库" width="120" />
      <el-table-column prop="qty" label="数量" width="90" />
      <el-table-column label="来源/去向" width="200">
        <template #default="{row}">
          <span v-if="row.type==='IN'">{{ row.source || '-' }}</span>
          <span v-else-if="row.type==='OUT'">{{ row.target || '-' }}</span>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="220" show-overflow-tooltip />
    </el-table>

    <div style="margin-top:12px; color:#999; font-size:12px">
      为了简单：后端默认最多返回 500 条最新记录（可在 functions/api/tx.ts 调整）。
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { apiGet } from "../api/client";
import { useRoute } from "vue-router";

const route = useRoute();

const items = ref<any[]>([]);
const rows = ref<any[]>([]);
const loading = ref(false);

const type = ref<string>("");
const item_id = ref<number | undefined>(undefined);
const dateRange = ref<[string, string] | null>(null);

function reset() {
  type.value = "";
  item_id.value = undefined;
  dateRange.value = null;
  load();
}

function toCsvCell(v: any) {
  const s = String(v ?? "");
  // escape quotes
  const escaped = s.replace(/"/g, '""');
  return `"${escaped}"`;
}

function exportCsv() {
  const headers = ["时间","单号","类型","SKU","名称","仓库","数量","来源","去向","备注"];
  const lines = [headers.map(toCsvCell).join(",")];
  for (const r of rows.value) {
    lines.push([
      r.created_at, r.tx_no, r.type, r.sku, r.name, r.warehouse_name, r.qty,
      r.source || "", r.target || "", r.remark || ""
    ].map(toCsvCell).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stock_tx_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function loadItems() {
  const j = await apiGet<{ ok: boolean; data: any[] }>(`/api/items`);
  items.value = j.data;

  const qid = Number(route.query.item_id);
  if (qid) item_id.value = qid;
}

async function load() {
  try {
    loading.value = true;
    const params = new URLSearchParams();
    if (type.value) params.set("type", type.value);
    if (item_id.value) params.set("item_id", String(item_id.value));
    if (dateRange.value?.[0]) params.set("date_from", `${dateRange.value[0]} 00:00:00`);
    if (dateRange.value?.[1]) params.set("date_to", `${dateRange.value[1]} 23:59:59`);

    const j = await apiGet<{ ok: boolean; data: any[] }>(`/api/tx?${params.toString()}`);
    rows.value = j.data;
  } catch (e: any) {
    ElMessage.error(e?.message || "加载失败");
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await loadItems();
  await load();
});
</script>
