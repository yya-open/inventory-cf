<template>
  <el-card>
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap">
      <div>
        <div style="font-weight:700; font-size:16px">备份 / 恢复</div>
        <div style="color:#888; font-size:12px; margin-top:6px; line-height:1.5">
          备份文件为 JSON（可用文本打开）。
          <b>恢复属于高风险操作</b>，请谨慎。
        </div>
      </div>
    </div>

    <el-divider />

    <el-row :gutter="16">
      <el-col :xs="24" :md="12">
        <el-card shadow="never" style="border:1px solid #f0f0f0">
          <template #header>
            <div style="display:flex; justify-content:space-between; align-items:center">
              <span style="font-weight:700">导出备份</span>
              <el-tag type="success" effect="light">推荐</el-tag>
            </div>
          </template>

          <div style="display:flex; flex-direction:column; gap:10px">
            <el-checkbox v-model="bk.include_tx">包含出入库明细（stock_tx，可能很大）</el-checkbox>
            <el-checkbox v-model="bk.include_stocktake">包含库存盘点（stocktake）</el-checkbox>
            <el-checkbox v-model="bk.include_audit">包含审计日志（audit_log，可能很大）</el-checkbox>
            <el-checkbox v-model="bk.include_throttle">包含登录限流记录（auth_login_throttle）</el-checkbox>

            <el-alert type="info" show-icon :closable="false">
              默认仅备份：仓库、配件、库存、用户。
              大表（明细/审计）请按需勾选。
            </el-alert>

            <div style="display:flex; gap:10px; flex-wrap:wrap">
              <el-button type="primary" :loading="downloading" @click="downloadBackup">下载备份文件</el-button>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12">
        <el-card shadow="never" style="border:1px solid #f0f0f0">
          <template #header>
            <div style="display:flex; justify-content:space-between; align-items:center">
              <span style="font-weight:700">从备份恢复</span>
              <el-tag type="danger" effect="light">高风险</el-tag>
            </div>
          </template>

          <div style="display:flex; flex-direction:column; gap:12px">
            <el-upload :auto-upload="false" :show-file-list="false" accept=".json" @change="onPick">
              <el-button>选择备份 JSON</el-button>
            </el-upload>

            <el-alert v-if="backupMeta" type="success" show-icon :closable="false">
              已加载：{{ backupMeta.version || 'unknown' }}
              <span v-if="backupMeta.exported_at">（{{ backupMeta.exported_at }}）</span>
            </el-alert>

            <el-radio-group v-model="mode">
              <el-radio label="merge">合并导入（推荐）</el-radio>
              <el-radio label="replace">清空并恢复（危险）</el-radio>
            </el-radio-group>

            <el-alert type="warning" show-icon :closable="false">
              合并导入：尽量不覆盖现有数据（INSERT OR IGNORE）。
              <br />
              清空并恢复：会先清空库再写入（不可恢复）。
            </el-alert>

            <div style="display:flex; gap:10px; flex-wrap:wrap">
              <el-button type="danger" :disabled="!backupObj" :loading="restoring" @click="doRestore">执行恢复</el-button>
            </div>

            <el-alert v-if="restoreResult" type="info" show-icon :closable="false">
              已完成：{{ restoreResult.inserted_total }} 条写入。
            </el-alert>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </el-card>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { apiDownload, apiPost } from "../api/client";

const bk = ref({
  include_tx: false,
  include_stocktake: false,
  include_audit: false,
  include_throttle: false,
});

const downloading = ref(false);

async function downloadBackup() {
  downloading.value = true;
  try {
    const q = new URLSearchParams();
    if (bk.value.include_tx) q.set("include_tx", "1");
    if (bk.value.include_stocktake) q.set("include_stocktake", "1");
    if (bk.value.include_audit) q.set("include_audit", "1");
    if (bk.value.include_throttle) q.set("include_throttle", "1");
    q.set("download", "1");
    await apiDownload(`/api/admin/backup?${q.toString()}`, "inventory_backup.json");
    ElMessage.success("备份已下载");
  } catch (e:any) {
    ElMessage.error(e?.message || "下载失败");
  } finally {
    downloading.value = false;
  }
}

const backupObj = ref<any>(null);
const backupMeta = ref<{version?:string; exported_at?:string} | null>(null);

async function onPick(uploadFile: any) {
  const file: File = uploadFile.raw;
  if (!file) return;
  try {
    const text = await file.text();
    const j = JSON.parse(text);
    if (!j?.tables) throw new Error("备份文件缺少 tables 字段");
    backupObj.value = j;
    backupMeta.value = { version: j.version, exported_at: j.exported_at };
    ElMessage.success("备份文件已加载");
  } catch (e:any) {
    backupObj.value = null;
    backupMeta.value = null;
    ElMessage.error(e?.message || "解析失败");
  }
}

const mode = ref<"merge"|"replace">("merge");
const restoring = ref(false);
const restoreResult = ref<any>(null);

async function doRestore() {
  if (!backupObj.value) return;
  const expected = mode.value === "replace" ? "清空并恢复" : "恢复";
  try {
    const { value: confirmText } = await ElMessageBox.prompt(
      mode.value === "replace"
        ? "将先清空数据库再恢复。请输入：清空并恢复"
        : "将导入备份数据（尽量不覆盖现有）。请输入：恢复",
      "二次确认",
      {
        confirmButtonText: "确认执行",
        cancelButtonText: "取消",
        inputPlaceholder: expected,
        inputValue: "",
        type: "warning",
      }
    ).catch(() => ({ value: "" } as any));

    if (String(confirmText || "").trim() !== expected) {
      ElMessage.warning("二次确认未通过，已取消");
      return;
    }

    restoring.value = true;
    restoreResult.value = null;
    const r = await apiPost<any>("/api/admin/restore", {
      mode: mode.value,
      confirm: expected,
      backup: backupObj.value,
    });
    restoreResult.value = r.data;
    ElMessage.success("恢复完成");
  } catch (e:any) {
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e?.message || "恢复失败");
  } finally {
    restoring.value = false;
  }
}
</script>
