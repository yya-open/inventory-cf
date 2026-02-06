<template>
  <el-card>
    <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin-bottom:12px">
      <el-select v-model="filters.warehouse_id" style="width:180px" placeholder="选择仓库" @change="load">
        <el-option v-for="w in warehouses" :key="w.id" :label="w.name" :value="w.id" />
      </el-select>

      <el-select v-model="filters.category" clearable style="width:180px" placeholder="分类" @change="load">
        <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
      </el-select>

      <el-input v-model="filters.keyword" style="width:260px" clearable placeholder="搜索：名称/SKU/品牌/型号" @keyup.enter="load" />

      <el-button type="primary" @click="load">查询</el-button>
      <el-button @click="reset">重置</el-button>

      <el-button type="warning" plain :loading="exporting" @click="exportCsv">一键导出</el-button>

      <div style="margin-left:auto; display:flex; gap:8px; align-items:center">
        <el-tag v-if="rows.length" type="danger">预警：{{ rows.length }} 条</el-tag>
        <el-button size="small" type="info" plain @click="$router.push('/stock')">去库存查询</el-button>
      </div>
    </div>

    <el-table :data="rows" v-loading="loading" stripe>
      <el-table-column prop="sku" label="SKU" width="160" />
      <el-table-column prop="name" label="名称" min-width="180" />
      <el-table-column prop="brand" label="品牌" width="120" />
      <el-table-column prop="model" label="型号" width="140" />
      <el-table-column prop="category" label="分类" width="120" />
      <el-table-column prop="qty" label="库存" width="90">
        <template #default="{ row }">
          <span style="color:#d93025; font-weight:600">{{ row.qty }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="warning_qty" label="预警值" width="90" />
      <el-table-column label="操作" width="190" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" plain @click="goIn(row.item_id)">入库</el-button>
          <el-button size="small" type="info" plain @click="goTx(row.item_id)">看明细</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && rows.length===0" description="暂无预警项目" />
  </el-card>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { apiGet } from "../api/client";
import { useRouter } from "vue-router";
import { useAuth } from "../store/auth";

const router = useRouter();
const { token } = useAuth();

const rows = ref<any[]>([]);
const loading = ref(false);
const exporting = ref(false);

const warehouses = ref<{ id: number; name: string }[]>([]);
const categories = ref<string[]>([]);

const filters = reactive<{ warehouse_id: number; category: string; keyword: string }>({
  warehouse_id: 1,
  category: "",
  keyword: "",
});

function goIn(item_id: number) {
  router.push({ path: "/in", query: { item_id: String(item_id), warehouse_id: String(filters.warehouse_id) } });
}
function goTx(item_id: number) {
  router.push({ path: "/tx", query: { item_id: String(item_id), warehouse_id: String(filters.warehouse_id) } });
}

async function loadMeta() {
  try {
    const w = await apiGet<{ ok: boolean; data: any[] }>(`/api/warehouses`);
    warehouses.value = (w.data || []).map((x: any) => ({ id: Number(x.id), name: String(x.name) }));
    if (!warehouses.value.find((x) => x.id === filters.warehouse_id) && warehouses.value.length) {
      filters.warehouse_id = warehouses.value[0].id;
    }
  } catch (e: any) {
    // 不阻塞页面，仓库列表失败时仍可用默认仓库
  }

  try {
    const c = await apiGet<{ ok: boolean; data: string[] }>(`/api/meta/categories`);
    categories.value = c.data || [];
  } catch (e: any) {
    categories.value = [];
  }
}

async function load() {
  try {
    loading.value = true;
    const qs = new URLSearchParams();
    qs.set("warehouse_id", String(filters.warehouse_id || 1));
    if (filters.category) qs.set("category", filters.category);
    if (filters.keyword.trim()) qs.set("keyword", filters.keyword.trim());
    const j = await apiGet<{ ok: boolean; data: any[] }>(`/api/warnings?` + qs.toString());
    rows.value = j.data || [];
  } catch (e: any) {
    ElMessage.error(e?.message || "加载失败");
  } finally {
    loading.value = false;
  }
}

function reset() {
  filters.category = "";
  filters.keyword = "";
  load();
}

async function exportCsv() {
  try {
    exporting.value = true;
    const qs = new URLSearchParams();
    qs.set("warehouse_id", String(filters.warehouse_id || 1));
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
    ElMessage.success("已导出");
  } catch (e: any) {
    ElMessage.error(e?.message || "导出失败");
  } finally {
    exporting.value = false;
  }
}

onMounted(async () => {
  await loadMeta();
  await load();
});
</script>
