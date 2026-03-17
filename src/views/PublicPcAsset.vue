<template>
  <div class="public-wrap">
    <el-card
      class="public-card"
      shadow="always"
    >
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div style="font-weight:700">
            电脑信息
          </div>
          <el-tag
            v-if="row"
            :type="statusTagType(row.status)"
          >
            {{ statusText(row.status) }}
          </el-tag>
        </div>
      </template>

      <div
        v-if="loading"
        style="padding:18px 0"
      >
        <el-skeleton
          :rows="6"
          animated
        />
      </div>

      <el-alert
        v-else-if="error"
        :title="error"
        type="error"
        show-icon
      />

      <el-descriptions
        v-else
        :column="2"
        border
      >
        <el-descriptions-item label="品牌">
          {{ row?.brand || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="型号">
          {{ row?.model || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="序列号">
          {{ row?.serial_no || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          {{ statusText(row?.status) }}
        </el-descriptions-item>

        <el-descriptions-item label="出厂日期">
          {{ row?.manufacture_date || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="保修到期">
          {{ row?.warranty_end || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="硬盘容量">
          {{ row?.disk_capacity || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="内存大小">
          {{ row?.memory_size || '-' }}
        </el-descriptions-item>

        <el-descriptions-item label="配置日期">
          {{ row?.last_config_date || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="回收日期">
          {{ row?.last_recycle_date || '-' }}
        </el-descriptions-item>

        <el-descriptions-item
          label="当前领用人"
          :span="2"
        >
          <div v-if="row?.status==='ASSIGNED'">
            <div style="font-weight:600">
              {{ row?.last_employee_name || '-' }}
            </div>
            <div style="color:#999;font-size:12px">
              {{ row?.last_employee_no || '-' }} · {{ row?.last_department || '-' }}
            </div>
          </div>
          <span v-else>-</span>
        </el-descriptions-item>

        <el-descriptions-item
          label="备注"
          :span="2"
        >
          <div style="white-space:pre-wrap">
            {{ row?.remark || '-' }}
          </div>
        </el-descriptions-item>
      </el-descriptions>

      <div
        v-if="!loading && !error"
        class="public-actions"
      >
        <el-button
          type="success"
          :loading="submittingOk"
          :disabled="cooldownLeft > 0"
          @click="submitOk"
        >
          盘点通过（在位）
        </el-button>
        <el-button
          type="warning"
          plain
          :disabled="cooldownLeft > 0"
          @click="issueVisible=true"
        >
          报异常
        </el-button>

        <div
          v-if="cooldownLeft > 0"
          class="cooldown"
        >
          已记录，{{ cooldownLeft }}s 后可再次提交
        </div>
      </div>
    </el-card>

    <el-dialog
      v-model="issueVisible"
      title="报异常"
      width="520px"
      destroy-on-close
    >
      <el-form
        :model="issueForm"
        label-width="86px"
      >
        <el-form-item
          label="异常类型"
          required
        >
          <el-select
            v-model="issueForm.issue_type"
            placeholder="请选择"
            style="width:100%"
          >
            <el-option
              label="不在位"
              value="NOT_FOUND"
            />
            <el-option
              label="位置不对"
              value="WRONG_LOCATION"
            />
            <el-option
              label="贴错码"
              value="WRONG_QR"
            />
            <el-option
              label="状态不对"
              value="WRONG_STATUS"
            />
            <el-option
              label="疑似丢失"
              value="MISSING"
            />
            <el-option
              label="其他"
              value="OTHER"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="issueForm.remark"
            type="textarea"
            :rows="3"
            placeholder="可选：补充说明"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="issueVisible=false">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="submittingIssue"
          :disabled="cooldownLeft > 0"
          @click="submitIssue"
        >
          提交
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { ElMessage } from "element-plus";
import { apiGetPublic, apiPostPublic } from "../api/client";

const loading = ref(true);
const error = ref<string>("");
const row = ref<any>(null);

const id = ref<string>("");
const key = ref<string>("");
const token = ref<string>("");

const submittingOk = ref(false);
const submittingIssue = ref(false);
const issueVisible = ref(false);
const issueForm = ref<{ issue_type: string; remark: string }>({ issue_type: "", remark: "" });

const cooldownLeft = ref(0);
let cooldownTimer: any = null;

function startCooldown(seconds = 30) {
  cooldownLeft.value = seconds;
  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    cooldownLeft.value = Math.max(0, cooldownLeft.value - 1);
    if (cooldownLeft.value <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  }, 1000);
}

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
    id.value = (url.searchParams.get("id") || "").trim();
    key.value = (url.searchParams.get("key") || "").trim();
    token.value = (url.searchParams.get("token") || "").trim();

    let apiUrl = "";
    if (id.value && key.value) {
      apiUrl = `/api/public/pc-asset?id=${encodeURIComponent(id.value)}&key=${encodeURIComponent(key.value)}`;
    } else if (token.value) {
      // 兼容旧版二维码
      apiUrl = `/api/public/pc-asset?token=${encodeURIComponent(token.value)}`;
    } else {
      error.value = "缺少二维码参数";
      return;
    }

    const j: any = await apiGetPublic(apiUrl);
    row.value = j.data;
  } catch (e: any) {
    error.value = e?.message || "获取失败";
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  if (cooldownTimer) clearInterval(cooldownTimer);
});

function inventoryApiUrl() {
  if (id.value && key.value) {
    return `/api/public/pc-asset-inventory?id=${encodeURIComponent(id.value)}&key=${encodeURIComponent(key.value)}`;
  }
  if (token.value) {
    return `/api/public/pc-asset-inventory?token=${encodeURIComponent(token.value)}`;
  }
  return "";
}

async function submitOk() {
  try {
    const apiUrl = inventoryApiUrl();
    if (!apiUrl) throw new Error("缺少二维码参数");
    submittingOk.value = true;
    await apiPostPublic(apiUrl, { action: "OK" });
    ElMessage.success("已记录：盘点通过");
    startCooldown(30);
  } catch (e: any) {
    ElMessage.error(e?.message || "提交失败");
  } finally {
    submittingOk.value = false;
  }
}

async function submitIssue() {
  try {
    const apiUrl = inventoryApiUrl();
    if (!apiUrl) throw new Error("缺少二维码参数");
    if (!issueForm.value.issue_type) throw new Error("请选择异常类型");
    submittingIssue.value = true;
    await apiPostPublic(apiUrl, { action: "ISSUE", issue_type: issueForm.value.issue_type, remark: issueForm.value.remark });
    ElMessage.success("已提交：异常");
    issueVisible.value = false;
    issueForm.value = { issue_type: "", remark: "" };
    startCooldown(30);
  } catch (e: any) {
    ElMessage.error(e?.message || "提交失败");
  } finally {
    submittingIssue.value = false;
  }
}
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
.cooldown{
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
