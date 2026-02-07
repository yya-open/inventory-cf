<template>
  <el-card>
    <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px">
      <el-select v-model="type" placeholder="类型" clearable style="width:140px">
        <el-option label="入库(IN)" value="IN" />
        <el-option label="出库(OUT)" value="OUT" />
        <el-option label="盘点调整(ADJUST)" value="ADJUST" />
        <el-option label="撤销盘点(REVERSAL)" value="REVERSAL" />
      </el-select>

      <el-select v-model="warehouse_id" placeholder="仓库" clearable style="width:160px">
        <el-option v-for="w in warehouses" :key="w.id" :label="w.name" :value="w.id" />
      </el-select>

      <el-select
        v-model="item_id"
        filterable
        remote
        reserve-keyword
        clearable
        :remote-method="remoteSearchItems"
        :loading="itemsLoading"
        placeholder="配件（可搜索）"
        style="width:320px"
      >
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

      <el-button type="primary" @click="onSearch">查询</el-button>
      <el-button @click="doExport" :disabled="rows.length===0">导出Excel</el-button>
      <el-button @click="reset">重置</el-button>
      <el-button type="success" plain @click="exportCsv" :disabled="rows.length===0">导出CSV</el-button>

      <el-button
        v-if="isAdmin"
        type="danger"
        plain
        @click="clearTx"
        :disabled="loading"
      >
        清空记录
      </el-button>
    </div>

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="created_at" label="时间" width="170" />
      <el-table-column prop="tx_no" label="单号" width="190" />
      <el-table-column prop="type" label="类型" width="120">
        <template #default="{row}">
          <el-tag :type="typeTagType(row.type)" effect="light" :title="row.type">
            {{ typeLabel(row.type) }}
          </el-tag>
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
      <el-table-column prop="delta_qty" label="变动" width="90">
        <template #default="{row}">
          <span v-if="typeof row.delta_qty === 'number'">{{ row.delta_qty > 0 ? '+' + row.delta_qty : row.delta_qty }}</span>
          <span v-else>{{ row.type==='IN' ? '+'+row.qty : row.type==='OUT' ? -row.qty : (row.delta_qty||0) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="来源/去向" width="200">
        <template #default="{row}">
          <span v-if="row.type==='IN'">{{ row.source || '-' }}</span>
          <span v-else-if="row.type==='OUT'">{{ row.target || '-' }}</span>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="220" show-overflow-tooltip />
    </el-table>

    <div style="display:flex; justify-content:flex-end; margin-top:12px">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        background
        layout="total, sizes, prev, pager, next, jumper"
        :page-sizes="[20, 50, 100, 200]"
        @current-change="onPageChange"
        @size-change="onPageSizeChange"
      />
    </div>

  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { apiGet, apiPost } from "../api/client";
import * as XLSX from "xlsx";
import { useRoute } from "vue-router";
import { useAuth } from "../store/auth";


const TYPE_LABEL: Record<string, string> = {
  IN: "入库",
  OUT: "出库",
  ADJUST: "盘点调整",
  REVERSAL: "撤销盘点",
};
function typeLabel(t: string) {
  return TYPE_LABEL[t] || t;
}
function typeTagType(t: string) {
  if (t === "IN") return "success";
  if (t === "OUT") return "danger";
  if (t === "ADJUST") return "warning";
  if (t === "REVERSAL") return "info";
  return "info";
}

const route = useRoute();

const warehouses = ref<{ id: number; name: string }[]>([]);
const warehouse_id = ref<number | undefined>(undefined);

const items = ref<any[]>([]);
const itemsLoading = ref(false);
let itemsReqSeq = 0;
const rows = ref<any[]>([]);
const loading = ref(false);

const page = ref(1);
const pageSize = ref(50);
const total = ref(0);

const type = ref<string>("");
const item_id = ref<number | undefined>(undefined);
const dateRange = ref<[string, string] | null>(null);

const auth = useAuth();
const isAdmin = computed(() => auth.user?.role === "admin");

function onSearch(){
  page.value = 1;
  load();
}

function reset() {
  type.value = "";
  item_id.value = undefined;
  warehouse_id.value = undefined;
  dateRange.value = null;
  page.value = 1;
  load();
}

function signedDelta(r: any) {
  if (typeof r?.delta_qty === "number") return r.delta_qty;
  // 兼容旧库：没有 delta_qty 时，用 IN/OUT 推断
  if (r?.type === "IN") return Number(r.qty) || 0;
  if (r?.type === "OUT") return -(Number(r.qty) || 0);
  return 0;
}

function toCsvCell(v: any) {
  const s = String(v ?? "");
  // escape quotes
  const escaped = s.replace(/"/g, '""');
  return `"${escaped}"`;
}

async function doExport() {
  try {
    loading.value = true;
    // 拉取全部符合筛选条件的数据（按页循环，避免只导出当前页）
    const all:any[] = [];
    const maxPages = 200; // 防止无限循环
    let p = 1;
    let t = 0;
    while (p <= maxPages) {
      const params = new URLSearchParams();
      if (type.value) params.set("type", type.value);
      if (item_id.value) params.set("item_id", String(item_id.value));
      if (warehouse_id.value) params.set("warehouse_id", String(warehouse_id.value));
      if (dateRange.value?.[0]) params.set("date_from", `${dateRange.value[0]} 00:00:00`);
      if (dateRange.value?.[1]) params.set("date_to", `${dateRange.value[1]} 23:59:59`);
      params.set("page", String(p));
      params.set("page_size", "5000");
      const j = await apiGet<any>(`/api/tx?${params.toString()}`);
      const arr = j.data || [];
      t = Number(j.total || 0);
      all.push(...arr);
      if (all.length >= t || arr.length === 0) break;
      p += 1;
      if (all.length >= 50000) break; // 保护：最多导出5万行
    }

    const data = all.map((r:any) => ({
      "时间": r.created_at,
      "单号": r.tx_no,
      "类型": r.type,
      "SKU": r.sku,
      "名称": r.name,
      "仓库": r.warehouse_name,
      "数量": r.qty,
      "变动": signedDelta(r),
      "来源": r.source || "",
      "去向": r.target || "",
      "备注": r.remark || ""
    }));

    const ws = XLSX.utils.json_to_sheet(data, { skipHeader: false });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "明细");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock_tx_${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success(`已导出 ${data.length} 条`);
  } catch (e:any) {
    ElMessage.error(e?.message || "导出失败");
  } finally {
    loading.value = false;
  }
}

function exportCsv() {
  const headers = ["时间","单号","类型","SKU","名称","仓库","数量","变动","来源","去向","备注"];
  const lines = [headers.map(toCsvCell).join(",")];
  for (const r of rows.value) {
    lines.push([
      r.created_at, r.tx_no, r.type, r.sku, r.name, r.warehouse_name, r.qty,
      signedDelta(r),
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

async function loadWarehouses() {
  try {
    const j = await apiGet<{ ok: boolean; data: any[] }>(`/api/warehouses`);
    warehouses.value = (j.data || []).map((x: any) => ({ id: Number(x.id), name: String(x.name) }));
  } catch {
    warehouses.value = [];
  }
}

async function loadItems(keyword = "", pageNo = 1) {
  itemsLoading.value = true;
  const seq = ++itemsReqSeq;
  try {
    const q = new URLSearchParams();
    q.set("page", String(pageNo));
    q.set("page_size", "50");
    if (keyword) q.set("keyword", keyword);
    const j = await apiGet<{ ok: boolean; data: any[] }>(`/api/items?${q.toString()}`);
    if (seq === itemsReqSeq) items.value = j.data || [];
  } finally {
    if (seq === itemsReqSeq) itemsLoading.value = false;
  }
}

async function ensureSelectedItemLabel(id?: number) {
  if (!id) return;
  if (items.value?.some((x) => Number(x.id) === Number(id))) return;
  try {
    const j = await apiGet<any>(`/api/items?id=${id}`);
    const it = j.data?.[0];
    if (it) items.value = [it, ...(items.value || [])];
  } catch {
    // ignore
  }
}

function remoteSearchItems(query: string) {
  loadItems(query, 1);
}

function onPageChange(){
  load();
}

function onPageSizeChange(){
  page.value = 1;
  load();
}

async function load() {
  try {
    loading.value = true;
    const params = new URLSearchParams();
    if (type.value) params.set("type", type.value);
    if (item_id.value) params.set("item_id", String(item_id.value));
    if (warehouse_id.value) params.set("warehouse_id", String(warehouse_id.value));
    if (dateRange.value?.[0]) params.set("date_from", `${dateRange.value[0]} 00:00:00`);
    if (dateRange.value?.[1]) params.set("date_to", `${dateRange.value[1]} 23:59:59`);

    params.set("page", String(page.value));
    params.set("page_size", String(pageSize.value));

    const j = await apiGet<any>(`/api/tx?${params.toString()}`);
    rows.value = j.data;
    total.value = Number(j.total || 0);
  } catch (e: any) {
    ElMessage.error(e?.message || "加载失败");
  } finally {
    loading.value = false;
  }
}

async function clearTx() {
  try {
    const params = new URLSearchParams();
    if (type.value) params.set("type", type.value);
    if (item_id.value) params.set("item_id", String(item_id.value));
    if (warehouse_id.value) params.set("warehouse_id", String(warehouse_id.value));
    if (dateRange.value?.[0]) params.set("date_from", `${dateRange.value[0]} 00:00:00`);
    if (dateRange.value?.[1]) params.set("date_to", `${dateRange.value[1]} 23:59:59`);

    const hasFilter = [...params.keys()].length > 0;

    const action = await ElMessageBox.confirm(
      hasFilter
        ? "将清空【当前筛选条件】下的出入库明细记录。\n\n如果你要清空全部记录，请点『清空全部』。"
        : "当前没有筛选条件，将清空【全部】出入库明细记录。\n\n此操作不可恢复，请谨慎！",
      "清空出入库明细",
      {
        type: "warning",
        confirmButtonText: hasFilter ? "清空当前筛选" : "确认清空全部",
        cancelButtonText: hasFilter ? "清空全部" : "取消",
        distinguishCancelAndClose: true,
      }
    ).then(
      () => (hasFilter ? "filtered" : "all"),
      (reason) => {
        if (reason === "cancel" && hasFilter) return "all";
        return null;
      }
    );

    if (!action) return;

    // Hard protection: require typing a confirmation word
    const expected = action === "all" ? "清空全部" : "清空";
    const { value: confirmText } = await ElMessageBox.prompt(
      action === "all"
        ? "此操作将【永久清空全部】出入库明细。请输入：清空全部"
        : "此操作将【永久清空当前筛选】的出入库明细。请输入：清空",
      "二次确认",
      {
        confirmButtonText: "确认执行",
        cancelButtonText: "取消",
        inputPlaceholder: expected,
        inputValue: "",
      }
    ).catch(() => ({ value: "" } as any));

    if (String(confirmText || "").trim() !== expected) {
      ElMessage.warning("二次确认未通过，已取消操作");
      return;
    }

    loading.value = true;
    const body: any = { mode: action, confirm: expected };
    if (action === "filtered") {
      if (type.value) body.type = type.value;
      if (item_id.value) body.item_id = item_id.value;
      if (warehouse_id.value) body.warehouse_id = warehouse_id.value;
      if (dateRange.value?.[0]) body.date_from = `${dateRange.value[0]} 00:00:00`;
      if (dateRange.value?.[1]) body.date_to = `${dateRange.value[1]} 23:59:59`;
    }

    const r = await apiPost<{ ok: boolean; data: { deleted: number } }>("/api/tx/clear", body);
    ElMessage.success(`已清空 ${r.data.deleted} 条记录`);
    await load();
  } catch (e: any) {
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e?.message || "清空失败");
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const qid = Number(route.query.item_id);
  if (qid) item_id.value = qid;
  const qwid = Number(route.query.warehouse_id);
  if (qwid) warehouse_id.value = qwid;
  await loadWarehouses();
  await loadItems();
  await ensureSelectedItemLabel(item_id.value);
  await load();
});
</script>
