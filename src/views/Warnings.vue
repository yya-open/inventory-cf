<template>
  <el-card>
    <div style="display:flex; gap:12px; align-items:center; margin-bottom:12px">
      <el-button type="primary" @click="load">刷新</el-button>
      <el-button @click="$router.push('/stock')">返回库存</el-button>
      <div style="color:#999;font-size:12px">
        规则：库存 ≤ 预警值 即进入预警列表
      </div>
    </div>

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="sku" label="SKU" width="200" />
      <el-table-column prop="name" label="名称" min-width="240" />
      <el-table-column prop="brand" label="品牌" width="140" />
      <el-table-column prop="model" label="型号" width="160" />
      <el-table-column prop="category" label="分类" width="120" />
      <el-table-column prop="qty" label="库存" width="90">
        <template #default="{row}">
          <span style="color:#d93026;font-weight:700">{{ row.qty }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="warning_qty" label="预警值" width="90" />
      <el-table-column label="建议补货" width="120">
        <template #default="{row}">
          <span style="color:#d93026;font-weight:700">{{ Math.max(row.warning_qty - row.qty, 0) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220">
        <template #default="{row}">
          <el-button size="small" type="primary" @click="goIn(row.item_id)">去入库</el-button>
          <el-button size="small" type="info" plain @click="goTx(row.item_id)">看明细</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && rows.length===0" description="暂无预警项目" />
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { apiGet } from "../api/client";
import { useRouter } from "vue-router";

const router = useRouter();
const rows = ref<any[]>([]);
const loading = ref(false);

function goIn(item_id: number) {
  router.push({ path: "/in", query: { item_id: String(item_id) } });
}
function goTx(item_id: number) {
  router.push({ path: "/tx", query: { item_id: String(item_id) } });
}

async function load() {
  try {
    loading.value = true;
    const j = await apiGet<{ ok: boolean; data: any[] }>(`/api/warnings?warehouse_id=1`);
    rows.value = j.data;
  } catch (e: any) {
    ElMessage.error(e?.message || "加载失败");
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
