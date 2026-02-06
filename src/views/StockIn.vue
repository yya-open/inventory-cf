<template>
  <el-card>
    <el-form label-width="90px" style="max-width: 560px">
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
const items = ref<any[]>([]);
const item_id = ref<number | undefined>(undefined);
const qty = ref(1);
const unit_price = ref<number>(0);
const source = ref("");
const remark = ref("");
const submitting = ref(false);

async function loadItems() {
  const j = await apiGet<{ ok: boolean; data: any[] }>(`/api/items`);
  items.value = j.data;
  const qid = Number(route.query.item_id);
  if (qid) item_id.value = qid;
}

async function submit() {
  try {
    submitting.value = true;
    await apiPost(`/api/stock-in`, {
      item_id: item_id.value,
      warehouse_id: 1,
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

onMounted(loadItems);
</script>
