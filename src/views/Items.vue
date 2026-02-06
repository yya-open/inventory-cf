<template>
  <el-card>
    <div style="display:flex; gap:12px; align-items:center; margin-bottom:12px; flex-wrap:wrap">
      <el-input v-model="keyword" placeholder="搜索：名称/SKU/品牌/型号" style="max-width: 360px" clearable />
      <el-button type="primary" @click="load">查询</el-button>
      <el-button @click="keyword=''; load()">重置</el-button>
      <el-button type="success" @click="openCreate">新增配件</el-button>
    </div>

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="sku" label="SKU" width="220" />
      <el-table-column prop="name" label="名称" min-width="220" />
      <el-table-column prop="brand" label="品牌" width="140" />
      <el-table-column prop="model" label="型号" width="160" />
      <el-table-column prop="category" label="分类" width="120" />
      <el-table-column prop="unit" label="单位" width="80" />
      <el-table-column prop="warning_qty" label="预警值" width="90" />
      <el-table-column label="操作" width="200">
        <template #default="{row}">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="info" plain @click="goTx(row.id)">明细</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dlgVisible" :title="dlgTitle" width="560px">
      <el-form label-width="90px">
        <el-form-item label="SKU" required>
          <el-input v-model="form.sku" placeholder="如：SSD-1T-NVME" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如：NVMe SSD 1TB" />
        </el-form-item>
        <el-form-item label="品牌">
          <el-input v-model="form.brand" />
        </el-form-item>
        <el-form-item label="型号">
          <el-input v-model="form.model" />
        </el-form-item>
        <el-form-item label="分类">
          <el-input v-model="form.category" placeholder="如：硬盘/内存/显卡..." />
        </el-form-item>
        <el-form-item label="单位">
          <el-input v-model="form.unit" placeholder="个/条/块/盒..." />
        </el-form-item>
        <el-form-item label="预警值">
          <el-input-number v-model="form.warning_qty" :min="0" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dlgVisible=false">取消</el-button>
        <el-button type="primary" @click="save" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

  </el-card>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { apiGet, apiPost } from "../api/client";
import { useRouter } from "vue-router";

const router = useRouter();

const keyword = ref("");
const rows = ref<any[]>([]);
const loading = ref(false);

const dlgVisible = ref(false);
const saving = ref(false);

const form = reactive<any>({
  id: undefined,
  sku: "",
  name: "",
  brand: "",
  model: "",
  category: "",
  unit: "个",
  warning_qty: 0,
});

const dlgTitle = computed(() => (form.id ? "编辑配件" : "新增配件"));

function resetForm() {
  form.id = undefined;
  form.sku = "";
  form.name = "";
  form.brand = "";
  form.model = "";
  form.category = "";
  form.unit = "个";
  form.warning_qty = 0;
}

function openCreate() {
  resetForm();
  dlgVisible.value = true;
}

function openEdit(row: any) {
  form.id = row.id;
  form.sku = row.sku;
  form.name = row.name;
  form.brand = row.brand || "";
  form.model = row.model || "";
  form.category = row.category || "";
  form.unit = row.unit || "个";
  form.warning_qty = Number(row.warning_qty || 0);
  dlgVisible.value = true;
}

function goTx(itemId: number) {
  router.push({ path: "/tx", query: { item_id: String(itemId) } });
}

async function load() {
  try {
    loading.value = true;
    const j = await apiGet<{ ok: boolean; data: any[] }>(`/api/items?keyword=${encodeURIComponent(keyword.value)}`);
    rows.value = j.data;
  } catch (e: any) {
    ElMessage.error(e?.message || "加载失败");
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!form.sku?.trim() || !form.name?.trim()) {
    ElMessage.warning("SKU 和 名称 为必填");
    return;
  }
  try {
    saving.value = true;
    await apiPost(`/api/items`, {
      id: form.id,
      sku: form.sku.trim(),
      name: form.name.trim(),
      brand: form.brand?.trim() || null,
      model: form.model?.trim() || null,
      category: form.category?.trim() || null,
      unit: form.unit?.trim() || "个",
      warning_qty: Number(form.warning_qty || 0),
    });
    ElMessage.success("保存成功");
    dlgVisible.value = false;
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || "保存失败");
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
