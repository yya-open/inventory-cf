<template>
  <el-card>
    <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 12px">
      <el-input v-model="keyword" placeholder="搜索：名称/SKU/品牌/型号" style="max-width: 360px" clearable />
      <el-button type="primary" @click="load">查询</el-button>
      <el-button @click="keyword = ''; load()">重置</el-button>
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
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { apiGet } from "../api/client";
import { useRouter } from "vue-router";

const router = useRouter();
const keyword = ref("");
const rows = ref<any[]>([]);
const loading = ref(false);

function goIn(item_id: number) {
  router.push({ path: "/in", query: { item_id: String(item_id) } });
}
function goOut(item_id: number) {
  router.push({ path: "/out", query: { item_id: String(item_id) } });
}
function goTx(item_id: number) {
  router.push({ path: "/tx", query: { item_id: String(item_id) } });
}

async function load() {
  try {
    loading.value = true;
    const j = await apiGet<{ ok: boolean; data: any[] }>(`/api/stock?keyword=${encodeURIComponent(keyword.value)}&warehouse_id=1`);
    rows.value = j.data;
  } catch (e: any) {
    ElMessage.error(e?.message || "加载失败");
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
