<template>
  <el-card>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" style="max-width: 560px">

      <el-form-item label="配件" prop="item_id">
        <el-select v-model="form.item_id" filterable placeholder="输入搜索 SKU/名称" style="width: 100%">
          <el-option v-for="it in items" :key="it.id" :label="`${it.sku} · ${it.name}`" :value="it.id" />
        </el-select>
      </el-form-item>

      <el-form-item label="数量" prop="qty">
        <el-input-number v-model="form.qty" :min="1" />
      </el-form-item>

      <el-form-item label="单价">
        <el-input-number v-model="form.unit_price" :min="0" :step="1" />
      </el-form-item>

      <el-form-item label="来源">
        <el-input v-model="form.source" placeholder="供应商/采购渠道" />
      </el-form-item>

      <el-form-item label="备注">
        <el-input v-model="form.remark" type="textarea" />
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :disabled="!canSubmit" @click="submit" :loading="submitting">入库</el-button>
        <el-button @click="$router.push('/stock')">返回库存</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { ElMessage } from "element-plus";
import { apiGet, apiPost } from "../api/client";
import { useRoute } from "vue-router";
import type { FormInstance, FormRules } from "element-plus";

const route = useRoute();


const items = ref<any[]>([]);

const formRef = ref<FormInstance>();
const form = ref({
  warehouse_id: 1 as number,
  item_id: undefined as number | undefined,
  qty: 1 as number,
  unit_price: 0 as number,
  source: "" as string,
  remark: "" as string,
});

const rules: FormRules = {
  item_id: [{ required: true, message: "请选择配件", trigger: "change" }],
  qty: [
    {
      required: true,
      trigger: "change",
      validator: (_rule, value, cb) => {
        const q = Number(value);
        if (!q || q <= 0) return cb(new Error("请输入数量"));
        cb();
      },
    },
  ],
};
const submitting = ref(false);
const pendingRid = ref<string>("");

const canSubmit = computed(() => {
  const q = Number(form.value.qty);
  return !!form.value.item_id && q > 0 && !submitting.value;
});


async function loadItems() {
  const j = await apiGet<{ ok: boolean; data: any[] }>(`/api/items?page=1&page_size=200`);
  items.value = j.data;

  const qid = Number(route.query.item_id);
  if (qid) form.value.item_id = qid;
}

async function submit() {
  try {
    const ok = await formRef.value?.validate().catch(() => false);
    if (!ok) return;
    submitting.value = true;
    const rid = pendingRid.value || crypto.randomUUID();
    pendingRid.value = rid;
    const r: any = await apiPost(`/api/stock-in`, {
      item_id: form.value.item_id,
      warehouse_id: form.value.warehouse_id,
      qty: form.value.qty,
      unit_price: form.value.unit_price,
      source: form.value.source,
      remark: form.value.remark,
      client_request_id: rid,
    });
    ElMessage.success(r?.duplicate ? "入库已处理（重复请求已忽略）" : "入库成功");
    pendingRid.value = "";
    form.value.qty = 1;
    form.value.unit_price = 0;
    form.value.source = "";
    form.value.remark = "";
    formRef.value?.clearValidate();
  } catch (e: any) {
    ElMessage.error(e?.message || "入库失败");
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  await loadItems();
});
</script>
