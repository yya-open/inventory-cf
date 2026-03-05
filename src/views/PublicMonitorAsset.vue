<template>
  <div class="public-wrap">
    <el-card class="public-card" shadow="always">
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div style="font-weight:700">显示器信息</div>
          <el-tag v-if="row" :type="statusTagType(row.status)">{{ statusText(row.status) }}</el-tag>
        </div>
      </template>

      <div v-if="loading" style="padding:18px 0">
        <el-skeleton :rows="6" animated />
      </div>

      <el-alert v-else-if="error" :title="error" type="error" show-icon />

      <el-descriptions v-else :column="2" border>
        <el-descriptions-item label="资产编号">{{ row?.asset_code || '-' }}</el-descriptions-item>
        <el-descriptions-item label="SN">{{ row?.sn || '-' }}</el-descriptions-item>

        <el-descriptions-item label="品牌">{{ row?.brand || '-' }}</el-descriptions-item>
        <el-descriptions-item label="型号">{{ row?.model || '-' }}</el-descriptions-item>

        <el-descriptions-item label="尺寸">{{ row?.size_inch || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusText(row?.status) }}</el-descriptions-item>

        <el-descriptions-item label="位置" :span="2">{{ locationText(row) }}</el-descriptions-item>

        <el-descriptions-item label="当前领用人" :span="2">
          <div v-if="row?.status==='ASSIGNED'">
            <div style="font-weight:600">{{ row?.employee_name || '-' }}</div>
            <div style="color:#999;font-size:12px">{{ row?.employee_no || '-' }} · {{ row?.department || '-' }}</div>
          </div>
          <span v-else>-</span>
        </el-descriptions-item>

        <el-descriptions-item label="备注" :span="2">
          <div style="white-space:pre-wrap">{{ row?.remark || '-' }}</div>
        </el-descriptions-item>
      </el-descriptions>

      <div v-if="!loading && !error" class="public-actions">
        <el-button type="primary" @click="refresh">刷新</el-button>
        <div class="hint">可按需刷新，信息实时更新</div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";

const loading = ref(true);
const error = ref<string>("");
const row = ref<any>(null);

const id = ref<string>("");
const key = ref<string>("");

function statusText(s: string) {
  if (s === "IN_STOCK") return "在库";
  if (s === "ASSIGNED") return "已领用";
  if (s === "RECYCLED") return "已回收";
  if (s === "SCRAPPED") return "已报废";
  return s || "-";
}

function statusTagType(s: string) {
  if (s === "IN_STOCK") return "success";
  if (s === "ASSIGNED") return "warning";
  if (s === "RECYCLED") return "info";
  if (s === "SCRAPPED") return "danger";
  return "info";
}

function locationText(r: any) {
  const p = r?.parent_location_name;
  const c = r?.location_name;
  return [p, c].filter(Boolean).join("/") || "-";
}

async function refresh() {
  loading.value = true;
  error.value = "";
  try {
    const url = new URL(window.location.href);
    id.value = (url.searchParams.get("id") || "").trim();
    key.value = (url.searchParams.get("key") || "").trim();
    if (!id.value || !key.value) throw new Error("缺少二维码参数");

    const apiUrl = `/api/public/monitor-asset?id=${encodeURIComponent(id.value)}&key=${encodeURIComponent(key.value)}`;
    const r = await fetch(apiUrl);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.message || "获取失败");
    row.value = j.data;
  } catch (e: any) {
    error.value = e?.message || "获取失败";
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>

<style scoped>
.public-wrap{
  min-height: 100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 22px 12px;
  background: radial-gradient(1200px 600px at 20% 0%, rgba(66,133,244,0.12), transparent 60%),
              radial-gradient(1200px 600px at 80% 0%, rgba(52,199,89,0.10), transparent 60%),
              linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.00));
}
.public-card{
  width: min(980px, 100%);
  border-radius: 14px;
}
.public-actions{
  display:flex;
  align-items:center;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
}
.hint{
  color:#999;
  font-size:12px;
}
:deep(.el-descriptions__label){
  width: 120px;
  color: #666;
}
:deep(.el-descriptions__content){
  color: #333;
}
</style>
