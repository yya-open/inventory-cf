<template>
  <el-card>
    <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin-bottom:12px">
<el-select v-model="filters.category" clearable style="width:180px" placeholder="分类" @change="load">
        <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
      </el-select>

      <el-input v-model="filters.keyword" style="width:240px" clearable placeholder="搜索：名称/SKU/品牌/型号" @keyup.enter="load" />

      <el-switch
        v-model="filters.only_alert"
        active-text="只看异常"
        inactive-text="显示全部"
        @change="load"
      />

      <el-select v-model="filters.sort" style="width:200px" @change="load">
        <el-option label="缺口从大到小" value="gap_desc" />
        <el-option label="缺口从小到大" value="gap_asc" />
        <el-option label="库存从小到大" value="qty_asc" />
        <el-option label="SKU A→Z" value="sku_asc" />
        <el-option label="名称 A→Z" value="name_asc" />
      </el-select>

      <el-button type="primary" @click="load">查询</el-button>
      <el-button @click="reset">重置</el-button>

      <el-button type="warning" plain :loading="exportingCsv" @click="exportCsv">导出 CSV</el-button>
      <el-button type="success" plain :loading="exportingXlsx" @click="exportXlsx">导出 Excel</el-button>

      <div style="margin-left:auto; display:flex; gap:8px; align-items:center">
        <el-tag v-if="total" type="danger">
          {{ filters.only_alert ? "预警" : "列表" }}：{{ total }} 条
        </el-tag>
        <el-button size="small" type="info" plain @click="$router.push('/stock')">去库存查询</el-button>
      </div>
    </div>

    <div v-if="selectedIds.length" style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:10px">
      <el-tag type="info">已选 {{ selectedIds.length }} 条</el-tag>

      <el-select v-model="bulkMode" style="width:220px">
        <el-option label="统一设置预警值" value="set" />
        <el-option label="在原预警值基础上 +X" value="add" />
        <el-option label="设置为当前库存 +X" value="qty_plus" />
      </el-select>

      <el-input-number
        v-if="bulkMode === 'set'"
        v-model="bulkWarningQty"
        :min="0"
        :step="1"
        controls-position="right"
      />
      <el-input-number
        v-else
        v-model="bulkDelta"
        :min="bulkMode === 'add' ? -999999 : 0"
        :step="1"
        controls-position="right"
      />

      <el-button-group v-if="bulkMode !== 'set'">
        <el-button size="small" @click="bulkDelta += 1">+1</el-button>
        <el-button size="small" @click="bulkDelta += 5">+5</el-button>
        <el-button size="small" @click="bulkDelta += 10">+10</el-button>
      </el-button-group>

      <el-button type="primary" :loading="bulkSaving" @click="applyBulkWarning">应用到已选</el-button>
      <el-button @click="clearSelection">清空选择</el-button>
      <div style="color:#909399">（批量设置预警值仅管理员可用）</div>
    </div>

    <el-table
      ref="tableRef"
      :data="rows"
      v-loading="loading"
      stripe
      @selection-change="onSelectionChange"
      row-key="item_id"
    >
      <el-table-column type="selection" width="46" />
      <el-table-column prop="sku" label="SKU" width="160" />
      <el-table-column prop="name" label="名称" min-width="180" />
      <el-table-column prop="brand" label="品牌" width="120" />
      <el-table-column prop="model" label="型号" width="140" />
      <el-table-column prop="category" label="分类" width="120" />
      <el-table-column prop="qty" label="库存" width="90">
        <template #default="{ row }">
          <span :style="{ color: row.qty <= row.warning_qty ? '#d93025' : '#1f883d', fontWeight: '600' }">
            {{ row.qty }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="warning_qty" label="预警值" width="90" />
      <el-table-column prop="gap" label="缺口" width="90">
        <template #default="{ row }">
          <span :style="{ color: row.gap >= 0 ? '#d93025' : '#606266', fontWeight: '600' }">
            {{ row.gap }}
          </span>
        </template>
      </el-table-column>

      <el-table-column prop="last_tx_at" label="最后变动" width="170">
        <template #default="{ row }">
          <span style="color:#606266">{{ formatTime(row.last_tx_at) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="190" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" plain @click="goIn(row.item_id)">入库</el-button>
          <el-button size="small" type="info" plain @click="goTx(row.item_id)">看明细</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="total" style="display:flex; justify-content:flex-end; margin-top:12px">
      <el-pagination
        background
        layout="total, sizes, prev, pager, next, jumper"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        :page-sizes="[20, 50, 100, 200]"
        @current-change="(p:number)=>{ page=p; load(); }"
        @size-change="(s:number)=>{ pageSize=s; page=1; load(); }"
      />
    </div>

    <el-empty v-if="!loading && rows.length===0" description="暂无数据" />
  </el-card>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from "vue";
import { ElMessage } from "element-plus";
import { apiGet, apiPost } from "../api/client";
import { useRouter } from "vue-router";
import { useAuth } from "../store/auth";
import * as XLSX from "xlsx";

const router = useRouter();
const { token } = useAuth();

const tableRef = ref<any>(null);
const rows = ref<any[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(50);
const total = ref(0);
const exportingCsv = ref(false);
const exportingXlsx = ref(false);

const categories = ref<string[]>([]);

const filters = reactive<{ category: string; keyword: string; only_alert: boolean; sort: string }>({
  category: "",
  keyword: "",
  only_alert: true,
  sort: "gap_desc",
});

const selected = ref<any[]>([]);
const selectedIds = computed(() => selected.value.map((r) => Number(r.item_id)).filter((n) => Number.isFinite(n)));
const bulkWarningQty = ref<number>(0);
const bulkDelta = ref<number>(5);
const bulkMode = ref<"set" | "add" | "qty_plus">("set");
const bulkSaving = ref(false);

const warehouseName = computed(()=> "主仓");

  return w?.name || `仓库#${1}`;
});

function goIn(item_id: number) {
  router.push({ path: "/in", query: { item_id: String(item_id) } });
}
function goTx(item_id: number) {
  router.push({ path: "/tx", query: { item_id: String(item_id) } });
}

function onSelectionChange(list: any[]) {
  selected.value = list || [];
}

function clearSelection() {
  selected.value = [];
  tableRef.value?.clearSelection?.();
}

async function applyBulkWarning() {
  if (!selectedIds.value.length) return;
  try {
    bulkSaving.value = true;
    const payload: any = { item_ids: selectedIds.value, mode: bulkMode.value };
    if (bulkMode.value === "set") {
      payload.warning_qty = Number(bulkWarningQty.value || 0);
    } else {
      payload.delta = Number(bulkDelta.value || 0);    }
    await apiPost<{ ok: boolean; updated: number }>(`/api/items/bulk-warning`, payload);
    ElMessage.success("已更新预警值");
    clearSelection();
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || "批量更新失败");
  } finally {
    bulkSaving.value = false;
  }
}

async function loadMeta() {

  try {
    const c = await apiGet<{ ok: boolean; data: string[] }>(`/api/meta/categories`);
    categories.value = c.data || [];
  } catch {
    categories.value = [];
  }
}

async function load() {
  try {
    loading.value = true;
    const qs = new URLSearchParams();    qs.set("only_alert", filters.only_alert ? "1" : "0");
    qs.set("sort", filters.sort || "gap_desc");
    qs.set("page", String(page.value));
    qs.set("page_size", String(pageSize.value));
    if (filters.category) qs.set("category", filters.category);
    if (filters.keyword.trim()) qs.set("keyword", filters.keyword.trim());
    const j = await apiGet<{ ok: boolean; data: any[]; total: number; page: number; pageSize: number }>(`/api/warnings?` + qs.toString());
    rows.value = (j.data || []).map((r: any) => ({
      ...r,
      qty: Number(r.qty ?? 0),
      warning_qty: Number(r.warning_qty ?? 0),
      gap: Number(r.gap ?? (Number(r.warning_qty ?? 0) - Number(r.qty ?? 0))),
      last_tx_at: r.last_tx_at ?? "",
    }));
    total.value = Number((j as any).total || 0);
  } catch (e: any) {
    ElMessage.error(e?.message || "加载失败");
  } finally {
    loading.value = false;
  }
}

function formatTime(v: any) {
  if (!v) return "-";
  try {
    // most likely ISO string from DB
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  } catch {
    return String(v);
  }
}

function reset() {
  filters.category = "";
  filters.keyword = "";
  filters.only_alert = true;
  filters.sort = "gap_desc";
  load();
}

async function exportCsv() {
  try {
    exportingCsv.value = true;
    const qs = new URLSearchParams();    qs.set("only_alert", filters.only_alert ? "1" : "0");
    qs.set("sort", filters.sort || "gap_desc");
    if (filters.category) qs.set("category", filters.category);
    if (filters.keyword.trim()) qs.set("keyword", filters.keyword.trim());

    const r = await fetch(`/api/warnings/export?` + qs.toString(), {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!r.ok) {
      const t = await r.text();
      throw new Error(t || "导出失败");
    }

    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    const cd = r.headers.get("content-disposition") || "";
    const m = cd.match(/filename="([^"]+)"/);
    a.download = m?.[1] || "warnings.csv";

    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    ElMessage.success("已导出 CSV");
  } catch (e: any) {
    ElMessage.error(e?.message || "导出失败");
  } finally {
    exportingCsv.value = false;
  }
}

function exportXlsx() {
  try {
    exportingXlsx.value = true;

    const data = rows.value.map((r) => ({
      仓库: warehouseName.value,
      SKU: r.sku,
      名称: r.name,
      品牌: r.brand,
      型号: r.model,
      分类: r.category,
      库存: r.qty,
      预警值: r.warning_qty,
      缺口: r.gap,
      最后变动: formatTime(r.last_tx_at),
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "预警中心");

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const filename = `warnings_${y}${m}${d}.xlsx`;

    XLSX.writeFile(wb, filename);
    ElMessage.success("已导出 Excel");
  } catch (e: any) {
    ElMessage.error((e as any)?.message || "导出失败");
  } finally {
    exportingXlsx.value = false;
  }
}

onMounted(async () => {
  await loadMeta();
  await load();
});
</script>
