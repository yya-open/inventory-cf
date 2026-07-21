<template>
  <div class="ui-page-shell stock-operation-page">
    <div class="ui-page-heading">
      <div>
        <div class="ui-page-heading__kicker">库存操作</div>
        <h1>配件入库</h1>
        <p>为指定配件登记入库数量、单价、来源和备注。</p>
      </div>
      <el-button @click="backToStock">返回库存</el-button>
    </div>

  <el-card class="stock-operation-card ui-panel" shadow="never">
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="90px"
      class="u-max-w-560"
    >
      <el-form-item
        label="配件"
        prop="item_id"
      >
        <el-select
          v-model="form.item_id"
          filterable
          placeholder="输入搜索 SKU/名称"
          class="u-w-full"
        >
          <el-option
            v-for="it in items"
            :key="it.id"
            :label="`${it.sku} · ${it.name}`"
            :value="it.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item
        label="数量"
        prop="qty"
      >
        <el-input-number
          v-model="form.qty"
          :min="1"
        />
      </el-form-item>

      <el-form-item label="单价">
        <el-input-number
          v-model="form.unit_price"
          :min="0"
          :step="1"
        />
      </el-form-item>

      <el-form-item label="来源">
        <el-input
          v-model="form.source"
          placeholder="供应商/采购渠道"
        />
      </el-form-item>

      <el-form-item label="备注">
        <el-input
          v-model="form.remark"
          type="textarea"
        />
      </el-form-item>

      <el-form-item>
        <el-button
          type="primary"
          :disabled="!canSubmit"
          :loading="submitting"
          @click="submit"
        >
          入库
        </el-button>
      </el-form-item>
    </el-form>
  </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { ElMessage } from "../utils/el-message";
import { apiGet, apiPost, isApiErrorCode } from "../api/client";
import { useRoute, useRouter } from "vue-router";
import type { FormInstance, FormRules } from "element-plus";
import { useFixedWarehouseId } from "../utils/warehouse";
import { validateWithFriendlyMessage } from "../utils/formValidation";

const route = useRoute();
const router = useRouter();
const warehouseId = useFixedWarehouseId();

const items = ref<any[]>([]);

const formRef = ref<FormInstance>();
const form = ref({
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
    const ok = await validateWithFriendlyMessage(
      formRef.value,
      (msg) => ElMessage.warning(msg),
      {
        item_id: '请选择配件',
        qty: '请输入正确的入库数量',
      },
    );
    if (!ok) return;
    submitting.value = true;
    const rid = pendingRid.value || crypto.randomUUID();
    pendingRid.value = rid;

    const r: any = await apiPost(`/api/stock-in`, {
      item_id: form.value.item_id,
      warehouse_id: warehouseId.value,
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
    if (isApiErrorCode(e, 'WRITE_CONFLICT')) {
      ElMessage.warning('检测到并发写入冲突，请稍后重试');
      return;
    }
    if (isApiErrorCode(e, 'INVALID_PARAMS')) {
      ElMessage.warning('入库参数无效，请检查配件和数量');
      return;
    }
    ElMessage.error(e?.message || "入库失败");
  } finally {
    submitting.value = false;
  }
}

function backToStock() {
  void router.push({ path: '/stock', query: { force_refresh: '1', force_refresh_tx: '1' } });
}

onMounted(async () => {
  await loadItems();
});
</script>

<style scoped>
.stock-operation-page{max-width:960px;margin:0 auto}
.stock-operation-card{border-radius:8px}
.stock-operation-card :deep(.el-card__body){padding:24px}
.stock-operation-card :deep(.el-form){max-width:640px}

@media (max-width:768px){
  .stock-operation-card :deep(.el-card__body){padding:16px}
  .stock-operation-card :deep(.el-form-item){
    display:flex;
    flex-direction:column;
    align-items:stretch;
  }
  .stock-operation-card :deep(.el-form-item__label){
    width:100% !important;
    justify-content:flex-start;
    margin-bottom:6px;
  }
  .stock-operation-card :deep(.el-form-item__content){
    width:100%;
  }
}
</style>
