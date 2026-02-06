<template>
  <el-card>
    <el-form label-width="90px" style="max-width: 560px">
      <el-form-item label="配件">
        <el-select v-model="item_id" filterable placeholder="输入搜索 SKU/名称" style="width: 100%" @change="loadQty">
          <el-option v-for="it in items" :key="it.id" :label="`${it.sku} · ${it.name}`" :value="it.id" />
        </el-select>
      </el-form-item>

      <el-form-item label="可用库存">
        <el-tag :type="available <= warning ? 'danger' : 'success'">{{ available }}</el-tag>
        <span style="margin-left: 10px; color: #888">（预警值：{{ warning }}）</span>
      </el-form-item>

      <el-form-item label="数量">
        <el-input-number v-model="qty" :min="1" />
        <span v-if="qty > available" style="margin-left: 10px; color: #d93026; font-weight: 600">库存不足</span>
      </el-form-item>

      <el-form-item label="领用人">
        <el-input v-model="target" placeholder="姓名/部门" />
      </el-form-item>

      <el-form-item label="备注">
        <el-input v-model="remark" type="textarea" />
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :disabled="!item_id || qty > available" @click="submit" :loading="submitting">出库</el-button>
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
const target = ref("");
const remark = ref("");
const submitting = ref(false);

const available = ref(0);
const warning = ref(0);

async function loadItems() {
  const j = await apiGet<{ ok: boolean; data: any[] }>(`/api/items`);
  items.value = j.data;

  const qid = Number(route.query.item_id);
  if (qid) {
    item_id.value = qid;
    await loadQty();
  }
}

async function loadQty() {
  const j = await apiGet<{ ok: boolean; data: any[] }>(`/api/stock?keyword=&warehouse_id=1`);
  const row = j.data.find((x: any) => x.item_id === item_id.value);
  available.value = row ? Number(row.qty) : 0;
  warning.value = row ? Number(row.warning_qty) : 0;
}

async function submit() {
  try {
    submitting.value = true;
    await apiPost(`/api/stock-out`, {
      item_id: item_id.value,
      warehouse_id: 1,
      qty: qty.value,
      target: target.value,
      remark: remark.value,
    });
    ElMessage.success("出库成功");
    qty.value = 1;
    target.value = "";
    remark.value = "";
    await loadQty();
  } catch (e: any) {
    ElMessage.error(e?.message || "出库失败");
  } finally {
    submitting.value = false;
  }
}

onMounted(loadItems);
</script>
