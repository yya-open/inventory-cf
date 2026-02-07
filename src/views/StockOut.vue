<template>
  <el-card>
    <el-form label-width="90px" style="max-width: 560px">
      <el-form-item label="仓库">
        <el-select v-model="warehouse_id" placeholder="选择仓库" style="width: 100%" @change="loadQty">
          <el-option v-for="w in warehouses" :key="w.id" :label="w.name" :value="w.id" />
        </el-select>
      </el-form-item>

      <el-form-item label="配件">
        <el-select
          v-model="item_id"
          filterable
          remote
          reserve-keyword
          :remote-method="remoteSearchItems"
          :loading="itemsLoading"
          placeholder="输入搜索 SKU/名称"
          style="width: 100%"
          @change="loadQty"
        >
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

const warehouses = ref<any[]>([]);
const warehouse_id = ref<number>(1);

const items = ref<any[]>([]);
const itemsLoading = ref(false);
let itemsReqSeq = 0;
const item_id = ref<number | undefined>(undefined);
const qty = ref(1);
const target = ref("");
const remark = ref("");
const submitting = ref(false);

const available = ref(0);
const warning = ref(0);

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
    ElMessage.error((e as any)?.message || "加载仓库失败");
  }
}

async function loadItems(keyword = "") {
  itemsLoading.value = true;
  const seq = ++itemsReqSeq;
  try {
    const q = encodeURIComponent(keyword || "");
    const j = await apiGet<{ ok: boolean; data: any[] }>(`/api/items?page=1&page_size=50&keyword=${q}`);
    if (seq !== itemsReqSeq) return;
    items.value = j.data || [];
  } finally {
    if (seq === itemsReqSeq) itemsLoading.value = false;
  }
}

async function ensureSelectedItemLabel(id: number) {
  if (!id) return;
  if (items.value.find((x: any) => Number(x.id) === id)) return;
  try {
    const j = await apiGet<{ ok: boolean; data: any }>(`/api/items?id=${id}`);
    if (j?.data) items.value = [j.data, ...items.value];
  } catch {
    // ignore
  }
}

async function remoteSearchItems(keyword: string) {
  await loadItems(keyword);
}

async function loadQty() {
  if (!item_id.value) { available.value = 0; warning.value = 0; return; }
  const j = await apiGet<{ ok: boolean; data: any[] }>(
    `/api/stock?keyword=&warehouse_id=${warehouse_id.value}`
  );
  const row = j.data.find((x: any) => x.item_id === item_id.value);
  available.value = row ? Number(row.qty) : 0;
  warning.value = row ? Number(row.warning_qty) : 0;
}

async function submit() {
  try {
    submitting.value = true;
    await apiPost(`/api/stock-out`, {
      item_id: item_id.value,
      warehouse_id: warehouse_id.value,
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

onMounted(async () => {
  await loadWarehouses();
  await loadItems("");

  const qid = Number(route.query.item_id);
  if (qid) {
    item_id.value = qid;
    await ensureSelectedItemLabel(qid);
    await loadQty();
  }
});
</script>
