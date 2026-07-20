<template>
  <div class="ui-page-shell stock-operation-page">
    <div class="ui-page-heading">
      <div>
        <div class="ui-page-heading__kicker">库存操作</div>
        <h1>配件出库</h1>
        <p>登记配件领用去向，并在提交前核对当前可用库存。</p>
      </div>
      <el-button @click="backToStock">返回库存</el-button>
    </div>

  <el-card class="stock-operation-card ui-panel" shadow="never">
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="90px"
      style="max-width: 560px"
    >
      <el-form-item
        label="配件"
        prop="item_id"
      >
        <el-select
          v-model="form.item_id"
          filterable
          placeholder="输入搜索 SKU/名称"
          style="width: 100%"
          @change="loadQty"
        >
          <el-option
            v-for="it in items"
            :key="it.id"
            :label="`${it.sku} · ${it.name}`"
            :value="it.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="可用库存">
        <el-tag :type="available <= warning ? 'danger' : 'success'">
          {{ available }}
        </el-tag>
        <span style="margin-left: 10px; color: var(--subtle)">（预警值：{{ warning }}）</span>
      </el-form-item>

      <el-form-item
        label="数量"
        prop="qty"
      >
        <el-input-number
          v-model="form.qty"
          :min="1"
        />
        <span
          v-if="form.qty > available"
          style="margin-left: 10px; color: var(--danger); font-weight: 600"
        >库存不足</span>
      </el-form-item>

      <el-form-item
        label="领用人"
        prop="target"
      >
        <el-input
          v-model="form.target"
          placeholder="姓名/部门"
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
          出库
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
  target: "" as string,
  remark: "" as string,
});

const available = ref(0);
const warning = ref(0);

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
  target: [{ required: true, message: "请输入领用人", trigger: "blur" }],
};

const submitting = ref(false);
const pendingRid = ref<string>("");

const canSubmit = computed(() => {
  const q = Number(form.value.qty);
  return !!form.value.item_id && q > 0 && q <= available.value && !!form.value.target.trim() && !submitting.value;
});

async function loadItems() {
  const j = await apiGet<{ ok: boolean; data: any[] }>(`/api/items?page=1&page_size=200`);
  items.value = j.data;

  const qid = Number(route.query.item_id);
  if (qid) form.value.item_id = qid;
}

async function loadQty() {
  if (!form.value.item_id) {
    available.value = 0;
    warning.value = 0;
    return;
  }
  try {
    const j: any = await apiGet(
      `/api/stock/one?item_id=${form.value.item_id}&warehouse_id=${warehouseId.value}`
    );
    available.value = Number(j?.data?.qty || 0);
    warning.value = Number(j?.data?.warning_qty || 0);
  } catch {
    available.value = 0;
    warning.value = 0;
  }
}

async function submit() {
  try {
    const ok = await validateWithFriendlyMessage(
      formRef.value,
      (msg) => ElMessage.warning(msg),
      {
        item_id: '请选择配件',
        qty: '请输入正确的出库数量',
        target: '请输入领用人/去向',
      },
    );
    if (!ok) return;
    submitting.value = true;
    const rid = pendingRid.value || crypto.randomUUID();
    pendingRid.value = rid;

    const r: any = await apiPost(`/api/stock-out`, {
      item_id: form.value.item_id,
      warehouse_id: warehouseId.value,
      qty: form.value.qty,
      target: form.value.target,
      remark: form.value.remark,
      client_request_id: rid,
    });

    ElMessage.success(r?.duplicate ? "出库已处理（重复请求已忽略）" : "出库成功");
    pendingRid.value = "";
    form.value.qty = 1;
    form.value.target = "";
    form.value.remark = "";
    formRef.value?.clearValidate();
    await loadQty();
  } catch (e: any) {
    if (isApiErrorCode(e, 'INSUFFICIENT_STOCK')) {
      ElMessage.warning('当前库存不足，请刷新库存后重试');
      return;
    }
    if (isApiErrorCode(e, 'WRITE_CONFLICT')) {
      ElMessage.warning('检测到并发出库冲突，请稍后重试');
      return;
    }
    if (isApiErrorCode(e, 'INVALID_PARAMS')) {
      ElMessage.warning('出库参数无效，请检查配件、数量和领用人');
      return;
    }
    ElMessage.error(e?.message || "出库失败");
  } finally {
    submitting.value = false;
  }
}

function backToStock() {
  void router.push({ path: '/stock', query: { force_refresh: '1', force_refresh_tx: '1' } });
}

onMounted(async () => {
  await loadItems();
  await loadQty();
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
