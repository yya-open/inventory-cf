<template>
  <el-card>
    <el-form label-width="90px" style="max-width: 560px">
      <el-form-item label="仓库">
        <el-select v-model="warehouse_id" placeholder="选择仓库" style="width: 100%">
          <el-option v-for="w in warehouses" :key="w.id" :label="w.name" :value="w.id" />
        </el-select>
      </el-form-item>

      <el-form-item label="配件">
        <el-select v-model="item_id" filterable placeholder="输入搜索 SKU/名称" style="width: 100%">
          <el-option v-for="it in items" :key="it.id" :label="`${it.sku} · ${it.name}`" :value="it.id" />
        </el-select>
      </el-form-item>

      <el-form-item label="数量">
        <el-input-number v-model="qty" :min="1" />
      </el-form-item>

      <el-form-item label="单价">
        <el-input-number v-model="unit_price" :min="0" :step="1" />
      </el-form-item>

      <el-form-item label="来源">
        <el-input v-model="source" placeholder="供应商/采购渠道" />
      </el-form-item>

      <el-form-item label="备注">
        <el-input v-model="remark" type="textarea" />
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :disabled="!item_id" @click="submit" :loading="submitting">入库</el-button>
        <el-button @click="$router.push('/stock')">返回库存</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { apiGet, apiPost } from "../api/client";
import { useRoute } from "vue-router";

const route = useRoute();

const warehouses = ref<any[]>([]);
const warehouse_id = ref<number>(1);

const items = ref<any[]>([]);
const item_id = ref<number | undefined>(undefined);
const qty = ref(1);
const unit_price = ref<number>(0);
const source = ref("");
const remark = ref("");
const submitting = ref(false);

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

async function loadItems() {
  const j = await apiGet<{ ok: boolean; data: any[] }>(`/api/items?page=1&page_size=200`);
  items.value = j.data;

  const qid = Number(route.query.item_id);
  if (qid) item_id.value = qid;
}

async function submit() {
  try {
    submitting.value = true;
    await apiPost(`/api/stock-in`, {
      item_id: item_id.value,
      warehouse_id: warehouse_id.value,
      qty: qty.value,
      unit_price: unit_price.value,
      source: source.value,
      remark: remark.value,
    });
    ElMessage.success("入库成功");
    qty.value = 1;
    unit_price.value = 0;
    source.value = "";
    remark.value = "";
  } catch (e: any) {
    ElMessage.error(e?.message || "入库失败");
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  await loadWarehouses();
  await loadItems();
});
</script>
