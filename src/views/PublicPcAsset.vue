<template>
  <div class="public-wrap">
    <el-card class="public-card" shadow="always">
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div style="font-weight:700">电脑信息</div>
          <el-tag v-if="row" :type="statusTagType(row.status)">{{ statusText(row.status) }}</el-tag>
        </div>
      </template>

      <div v-if="loading" style="padding:18px 0">
        <el-skeleton :rows="6" animated />
      </div>

      <el-alert v-else-if="error" :title="error" type="error" show-icon />

      <el-descriptions v-else :column="2" border>
        <el-descriptions-item label="品牌">{{ row?.brand || '-' }}</el-descriptions-item>
        <el-descriptions-item label="型号">{{ row?.model || '-' }}</el-descriptions-item>
        <el-descriptions-item label="序列号">{{ row?.serial_no || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusText(row?.status) }}</el-descriptions-item>

        <el-descriptions-item label="出厂日期">{{ row?.manufacture_date || '-' }}</el-descriptions-item>
        <el-descriptions-item label="保修到期">{{ row?.warranty_end || '-' }}</el-descriptions-item>
        <el-descriptions-item label="硬盘容量">{{ row?.disk_capacity || '-' }}</el-descriptions-item>
        <el-descriptions-item label="内存大小">{{ row?.memory_size || '-' }}</el-descriptions-item>

        <el-descriptions-item label="配置日期">{{ row?.last_config_date || '-' }}</el-descriptions-item>
        <el-descriptions-item label="回收日期">{{ row?.last_recycle_date || '-' }}</el-descriptions-item>

        <el-descriptions-item label="当前领用人" :span="2">
          <div v-if="row?.status==='ASSIGNED'">
            <div style="font-weight:600">{{ row?.last_employee_name || '-' }}</div>
            <div style="color:#999;font-size:12px">{{ row?.last_employee_no || '-' }} · {{ row?.last_department || '-' }}</div>
          </div>
          <span v-else>-</span>
        </el-descriptions-item>

        <el-descriptions-item label="备注" :span="2">
          <div style="white-space:pre-wrap">{{ row?.remark || '-' }}</div>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";

const loading = ref(true);
const error = ref<string>("");
const row = ref<any>(null);

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

onMounted(async () => {
  try {
    const url = new URL(window.location.href);
    const id = (url.searchParams.get("id") || "").trim();
    const key = (url.searchParams.get("key") || "").trim();
    const token = (url.searchParams.get("token") || "").trim();

    let apiUrl = "";
    if (id && key) {
      apiUrl = `/api/public/pc-asset?id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`;
    } else if (token) {
      // 兼容旧版二维码
      apiUrl = `/api/public/pc-asset?token=${encodeURIComponent(token)}`;
    } else {
      error.value = "缺少二维码参数";
      return;
    }

    const r = await fetch(apiUrl);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.message || "获取失败");
    row.value = j.data;
  } catch (e: any) {
    error.value = e?.message || "获取失败";
  } finally {
    loading.value = false;
  }
});
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
:deep(.el-descriptions__label){
  width: 120px;
  color: #666;
}
:deep(.el-descriptions__content){
  color: #333;
}
</style>
