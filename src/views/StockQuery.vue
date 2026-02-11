<template>
  <el-card>
    <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 12px; flex-wrap:wrap">
      <el-select v-model="warehouse_id" style="width: 180px" placeholder="选择仓库" @change="onSearch">
        <el-option v-for="w in warehouses" :key="w.id" :label="w.name" :value="w.id" />
      </el-select>

      <el-input v-model="keyword" placeholder="搜索：名称/SKU/品牌/型号" style="max-width: 360px" clearable />
      <el-select v-model="sort" style="width: 160px" placeholder="排序" @change="onSearch">
        <el-option label="预警优先" value="warning_first" />
        <el-option label="库存升序" value="qty_asc" />
        <el-option label="库存降序" value="qty_desc" />
        <el-option label="SKU 升序" value="sku_asc" />
        <el-option label="名称 升序" value="name_asc" />      </el-select>
      <el-button type="primary" @click="onSearch">查询</el-button>
      <el-button @click="onReset">重置</el-button>
      <el-button @click="doExport">导出Excel</el-button>
      <el-button type="warning" plain @click="$router.push('/warnings')">查看预警</el-button>
    </div>

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="sku" label="SKU" width="200" />
      <el-table-column prop="name" label="名称" min-width="220" />
      <el-table-column prop="brand" label="品牌" width="140" />
      <el-table-column prop="model" label="型号" width="160" />
      <el-table-column prop="category" label="分类" width="120" />
      <el-table-column prop="qty" label="库存" width="100">
        <template #default="{ row }">
          <span :style="{ color: row.is_warning ? '#d93026' : '', fontWeight: row.is_warning ? '700' : '' }">
            {{ row.qty }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="warning_qty" label="预警值" width="100" />
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.is_warning" type="danger">预警</el-tag>
          <el-tag v-else type="success">正常</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="快捷操作" width="220">
        <template #default="{ row }">
          <el-button size="small" @click="goIn(row.item_id)">入库</el-button>
          <el-button size="small" type="primary" plain @click="goOut(row.item_id)">出库</el-button>
          <el-button size="small" type="info" plain @click="goTx(row.item_id)">明细</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div style="display:flex; justify-content:flex-end; padding-top:12px">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100, 200]"
        layout="total, sizes, prev, pager, next, jumper"
        @current-change="onPageChange"
        @size-change="onPageSizeChange"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { apiGet } from "../api/client";
import * as XLSX from "xlsx";
import { useRouter, useRoute } from "vue-router";

const router = useRouter();
const route = useRoute();

const warehouses = ref<any[]>([]);
const warehouse_id = ref<number>(1);

const keyword = ref("");
const sort = ref<string>("warning_first");
const rows = ref<any[]>([]);
const loading = ref(false);

const page = ref(1);
const pageSize = ref(50);
const total = ref(0);

function goIn(item_id: number) {
  router.push({ path: "/in", query: { item_id: String(item_id), warehouse_id: String(warehouse_id.value) } });
}
function goOut(item_id: number) {
  router.push({ path: "/out", query: { item_id: String(item_id), warehouse_id: String(warehouse_id.value) } });
}
function goTx(item_id: number) {
  router.push({ path: "/tx", query: { item_id: String(item_id), warehouse_id: String(warehouse_id.value) } });
}

async function loadWarehouses() {
  try {
    const r: any = await apiGet("/api/warehouses");
    warehouses.value = r.data || [];
    const qWarehouse = Number(route.query.warehouse_id);
    if (qWarehouse && warehouses.value.find((w: any) => Number(w.id) === qWarehouse)) {
      warehouse_id.value = qWarehouse;
    } else if (warehouses.value?.length) {
      warehouse_id.value = warehouses.value[0].id;
    }
  } catch (e: any) {
    ElMessage.error(e?.message || "加载仓库失败");
  }
}

function onSearch(){
  page.value = 1;
  load();
}

function onReset(){
  keyword.value = "";
  sort.value = "warning_first";
  page.value = 1;
  load();
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
    const j = await apiGet<{ ok: boolean; data: any[]; total: number; page: number; pageSize: number }>(
      `/api/stock?keyword=${encodeURIComponent(keyword.value)}&warehouse_id=${warehouse_id.value}` +
      `&sort=${encodeURIComponent(sort.value)}&page=${page.value}&page_size=${pageSize.value}`
    );
    rows.value = j.data || [];
    total.value = Number((j as any).total || 0);
  } catch (e: any) {
    ElMessage.error(e?.message || "加载失败");
  } finally {
    loading.value = false;
  }
}

function doExport() {
  const header = ["SKU","名称","品牌","型号","分类","库存","预警值"];
  const aoa: any[][] = [header];
  for (const r of rows.value) {
    aoa.push([r.sku, r.name, r.brand || "", r.model || "", r.category || "", Number(r.qty), Number(r.warning_qty)]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "stock");
  XLSX.writeFile(wb, `stock_${warehouse_id.value}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

onMounted(async () => {
  await loadWarehouses();
  await load();
});
</script>
