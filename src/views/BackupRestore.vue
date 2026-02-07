<template>
  <el-card>
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap">
      <div>
        <div style="font-weight:700; font-size:16px">备份 / 恢复</div>
        <div style="color:#888; font-size:12px; margin-top:6px; line-height:1.5">
          备份文件为 JSON（支持 <b>.json.gz</b> 压缩）。
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
            <div v-if="bk.include_tx" style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; padding-left:24px">
              <span style="color:#666; font-size:12px">明细时间范围：</span>
              <el-date-picker
                v-model="bk.txRange"
                type="daterange"
                unlink-panels
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                value-format="YYYY-MM-DD"
              />
              <span style="color:#999; font-size:12px">（为空则导出全部）</span>
</div>

            <el-checkbox v-model="bk.include_stocktake">包含库存盘点（stocktake）</el-checkbox>

            <el-checkbox v-model="bk.include_audit">包含审计日志（audit_log，可能很大）</el-checkbox>
            <div v-if="bk.include_audit" style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; padding-left:24px">
              <span style="color:#666; font-size:12px">审计时间范围：</span>
              <el-date-picker
                v-model="bk.auditRange"
                type="daterange"
                unlink-panels
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                value-format="YYYY-MM-DD"
              />
              <span style="color:#999; font-size:12px">（为空则导出全部）</span>
</div>

            <el-checkbox v-model="bk.include_throttle">包含登录限流记录（auth_login_throttle）</el-checkbox>

            <el-divider style="margin:10px 0" />

            <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center">
              <el-checkbox v-model="bk.gzip">启用压缩（.json.gz，更小更快）</el-checkbox>

              <div style="display:flex; gap:8px; align-items:center">
                <span style="color:#666; font-size:12px">分页：</span>
                <el-input-number v-model="bk.page_size" :min="100" :max="5000" :step="100" controls-position="right" />
                <span style="color:#999; font-size:12px">（大表建议 1000～2000）</span>
              </div>
            </div>

            <el-alert type="info" show-icon :closable="false">
              默认仅备份：仓库、配件、库存、用户。
              大表（明细/审计）请按需勾选，并建议开启压缩。
            </el-alert>

            <div style="display:flex; gap:10px; flex-wrap:wrap">
              <el-button type="primary" :loading="downloading" @click="downloadBackup">下载备份文件</el-button>
              <el-button :loading="downloading" @click="downloadTxOnly" plain>仅导出明细</el-button>
              <el-button :loading="downloading" @click="downloadAuditOnly" plain>仅导出审计</el-button>
            </div>

            <div style="color:#999; font-size:12px; line-height:1.6">
              提示：如果备份很大，建议“仅导出明细/审计”分开下载，避免一次文件过大。
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
            <el-upload :auto-upload="false" :show-file-list="false" accept=".json,.gz" @change="onPick">
              <el-button>选择备份（.json / .json.gz）</el-button>
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
import { ElMessageBox } from "element-plus";
import { msgError, msgSuccess, msgWarn } from "../utils/msg";
import { apiDownload, apiPost } from "../api/client";

const bk = ref({
  include_tx: false,
  include_stocktake: false,
  include_audit: false,
  include_throttle: false,

  // 大数据导出优化
  gzip: true,
  page_size: 1000,

  // YYYY-MM-DD
  txRange: [] as string[] | [],
  auditRange: [] as string[] | [],
});

const downloading = ref(false);

function buildBackupQuery(extra?: Record<string, string>) {
  const q = new URLSearchParams();
  if (bk.value.include_tx) q.set("include_tx", "1");
  if (bk.value.include_stocktake) q.set("include_stocktake", "1");
  if (bk.value.include_audit) q.set("include_audit", "1");
  if (bk.value.include_throttle) q.set("include_throttle", "1");

  // gzip / pagination
  if (bk.value.gzip) q.set("gzip", "1");
  q.set("page_size", String(bk.value.page_size || 1000));

  // time ranges for big tables
  if (bk.value.include_tx && Array.isArray(bk.value.txRange) && bk.value.txRange.length === 2) {
    q.set("tx_since", bk.value.txRange[0]);
    q.set("tx_until", bk.value.txRange[1]);
  }
  if (bk.value.include_audit && Array.isArray(bk.value.auditRange) && bk.value.auditRange.length === 2) {
    q.set("audit_since", bk.value.auditRange[0]);
    q.set("audit_until", bk.value.auditRange[1]);
  }

  if (extra) {
    Object.entries(extra).forEach(([k, v]) => q.set(k, v));
  }
  q.set("download", "1");
  return q;
}

async function downloadBackup() {
  downloading.value = true;
  try {
    const q = buildBackupQuery();
    const fname = bk.value.gzip ? "inventory_backup.json.gz" : "inventory_backup.json";
    await apiDownload(`/api/admin/backup?${q.toString()}`, fname);
    msgSuccess("备份已下载");
  } catch (e:any) {
    msgError(e?.message || "下载失败");
  } finally {
    downloading.value = false;
  }
}

async function downloadTxOnly() {
  downloading.value = true;
  try {
    const q = buildBackupQuery({ table: "stock_tx" });
    const fname = bk.value.gzip ? "inventory_stock_tx.json.gz" : "inventory_stock_tx.json";
    await apiDownload(`/api/admin/backup?${q.toString()}`, fname);
    msgSuccess("明细已下载");
  } catch (e:any) {
    msgError(e?.message || "下载失败");
  } finally {
    downloading.value = false;
  }
}

async function downloadAuditOnly() {
  downloading.value = true;
  try {
    const q = buildBackupQuery({ table: "audit_log" });
    const fname = bk.value.gzip ? "inventory_audit_log.json.gz" : "inventory_audit_log.json";
    await apiDownload(`/api/admin/backup?${q.toString()}`, fname);
    msgSuccess("审计已下载");
  } catch (e:any) {
    msgError(e?.message || "下载失败");
  } finally {
    downloading.value = false;
  }
}

const backupObj = ref<any>(null);
const backupMeta = ref<{version?:string; exported_at?:string} | null>(null);

async function readMaybeGzipText(file: File) {
  const name = (file.name || "").toLowerCase();
  const isGz = name.endsWith(".gz");
  if (!isGz) return await file.text();

  // Browser gzip decompress (Chrome/Edge support)
  // If not supported, ask user to export without gzip.
  // @ts-ignore
  if (typeof DecompressionStream === "undefined") {
    throw new Error("当前浏览器不支持 .gz 解压。请使用 Chrome/Edge，或导出时关闭“启用压缩”。");
  }

  const ab = await file.arrayBuffer();
  const ds = new DecompressionStream("gzip");
  const decompressed = new Response(new Blob([ab]).stream().pipeThrough(ds));
  return await decompressed.text();
}

async function onPick(uploadFile: any) {
  const file: File = uploadFile.raw;
  if (!file) return;
  try {
    const text = await readMaybeGzipText(file);
    const j = JSON.parse(text);
    if (!j?.tables) throw new Error("备份文件缺少 tables 字段");
    backupObj.value = j;
    backupMeta.value = { version: j.version, exported_at: j.exported_at };
    msgSuccess("备份文件已加载");
  } catch (e:any) {
    backupObj.value = null;
    backupMeta.value = null;
    msgError(e?.message || "解析失败");
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
      msgWarn("二次确认未通过，已取消");
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
    msgSuccess("恢复完成");
  } catch (e:any) {
    if (e === "cancel" || e === "close") return;
    msgError(e?.message || "恢复失败");
  } finally {
    restoring.value = false;
  }
}
</script>
