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

            <el-alert v-if="pickedInfo" type="success" show-icon :closable="false">
              已选择：{{ pickedInfo }}
            </el-alert>

            <el-radio-group v-model="mode" :disabled="!!jobId && (jobStatus==='RUNNING' || jobStatus==='DONE')">
              <el-radio label="merge">合并导入（推荐）</el-radio>
              <el-radio label="replace">清空并恢复（危险）</el-radio>
            </el-radio-group>

            <el-alert type="warning" show-icon :closable="false">
              合并导入：尽量不覆盖现有数据（INSERT OR IGNORE）。
              <br />
              清空并恢复：会先清空库再写入（不可恢复）。
            </el-alert>

            <div style="display:flex; gap:10px; flex-wrap:wrap">
              <el-button type="primary" :disabled="!pickedFile || creatingJob" :loading="creatingJob" @click="createJob">
                创建恢复任务
              </el-button>

              <el-button type="danger" :disabled="!jobId" :loading="running" @click="startOrResume">
                {{ jobStatus==='PAUSED' ? '继续恢复' : (jobStatus==='RUNNING' ? '恢复中...' : '开始恢复') }}
              </el-button>

              <el-button :disabled="!jobId || jobStatus!=='RUNNING'" :loading="pausing" @click="pauseJob">
                暂停
              </el-button>

              <el-button :disabled="!jobId" @click="refreshStatus" plain>刷新状态</el-button>
            </div>

            <el-alert v-if="jobId" type="info" show-icon :closable="false">
              任务：{{ jobId }}　状态：{{ jobStatus }}　阶段：{{ jobStage }}
              <span v-if="jobCurrentTable">　当前表：{{ jobCurrentTable }}</span>
            </el-alert>

            <div v-if="jobId" style="display:flex; flex-direction:column; gap:8px">
              <el-progress :percentage="progressPercent" :status="progressStatus" />
              <div style="color:#666; font-size:12px; line-height:1.6">
                已处理：{{ jobProcessed }} / {{ jobTotal || '计算中...' }} 行
                <span v-if="jobLastError" style="color:#d33">　错误：{{ jobLastError }}</span>
              </div>
            </div>

            <el-alert v-if="jobStatus==='DONE'" type="success" show-icon :closable="false">
              恢复完成 ✅
            </el-alert>

            <el-alert v-if="jobStatus==='FAILED'" type="error" show-icon :closable="false">
              恢复失败：{{ jobLastError || '未知错误' }}
            </el-alert>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ElMessageBox } from "element-plus";
import { msgError, msgSuccess, msgWarn } from "../utils/msg";
import { apiDownload, apiPostForm, apiGet, apiPost } from "../api/client";

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
    downloading.value = falsconst pickedFile = ref<File | null>(null);
const pickedInfo = ref<string>("");

async function onPick(uploadFile: any) {
  const file: File = uploadFile.raw;
  if (!file) return;
  pickedFile.value = file;

  const mb = (file.size / 1024 / 1024).toFixed(2);
  pickedInfo.value = `${file.name}（${mb} MB）`;
  msgSuccess("已选择备份文件");
}

const mode = ref<"merge"|"replace">("merge");

const creatingJob = ref(false);
const jobId = ref<string>("");
const jobStatus = ref<string>("");
const jobStage = ref<string>("");
const jobTotal = ref<number>(0);
const jobProcessed = ref<number>(0);
const jobCurrentTable = ref<string>("");
const jobLastError = ref<string>("");

const running = ref(false);
const pausing = ref(false);

const progressPercent = computed(() => {
  if (!jobTotal.value) return 0;
  const p = Math.floor((jobProcessed.value / jobTotal.value) * 100);
  return Math.max(0, Math.min(100, p));
});

const progressStatus = computed(() => {
  if (jobStatus.value === "FAILED") return "exception";
  if (jobStatus.value === "DONE") return "success";
  return undefined as any;
});

async function createJob() {
  if (!pickedFile.value) return;

  const expected = mode.value === "replace" ? "清空并恢复" : "恢复";
  try {
    const { value: confirmText } = await ElMessageBox.prompt(
      mode.value === "replace"
        ? "将先清空数据库再恢复。请输入：清空并恢复"
        : "将导入备份数据（尽量不覆盖现有）。请输入：恢复",
      "二次确认",
      {
        confirmButtonText: "创建任务",
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

    creatingJob.value = true;
    const form = new FormData();
    form.set("mode", mode.value);
    form.set("confirm", expected);
    form.set("file", pickedFile.value);

    const r = await apiPostForm<any>("/api/admin/restore_job/create", form);
    jobId.value = r.data.id;
    msgSuccess("任务已创建");

    await refreshStatus();
  } catch (e:any) {
    msgError(e?.message || "创建任务失败");
  } finally {
    creatingJob.value = false;
  }
}

async function refreshStatus() {
  if (!jobId.value) return;
  try {
    const r = await apiGet<any>(`/api/admin/restore_job/status?id=${encodeURIComponent(jobId.value)}`);
    const d = r.data;
    jobStatus.value = d.status || "";
    jobStage.value = d.stage || "";
    jobTotal.value = Number(d.total_rows || 0);
    jobProcessed.value = Number(d.processed_rows || 0);
    jobCurrentTable.value = d.current_table || "";
    jobLastError.value = d.last_error || "";
  } catch (e:any) {
    msgError(e?.message || "刷新失败");
  }
}

let loopTimer: any = null;

function stopLoop() {
  running.value = false;
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
}

async function startOrResume() {
  if (!jobId.value) {
    msgWarn("请先创建恢复任务");
    return;
  }
  if (running.value) return;

  running.value = true;
  try {
    while (running.value) {
      // 每次 run 处理一段数据，前端循环驱动（可暂停/可续跑）
      const r = await apiPost<any>("/api/admin/restore_job/run", { id: jobId.value, max_rows: 2000, max_ms: 8000 });
      await refreshStatus();

      const st = jobStatus.value;
      const more = Boolean(r.data.more);

      if (st === "DONE" || st === "FAILED") {
        stopLoop();
        return;
      }

      // 如果被暂停/取消，停止循环
      if (st === "PAUSED" || st === "CANCELED") {
        stopLoop();
        return;
      }

      if (!more) {
        // 没有更多就等一会儿再拉一次状态
        loopTimer = setTimeout(() => { startOrResume(); }, 1200);
        return;
      }

      // 让出事件循环，避免 UI 卡顿
      await new Promise((r) => setTimeout(r, 150));
    }
  } catch (e:any) {
    stopLoop();
    msgError(e?.message || "运行失败");
    await refreshStatus();
  }
}

async function pauseJob() {
  if (!jobId.value) return;
  pausing.value = true;
  try {
    await apiPost("/api/admin/restore_job/cancel", { id: jobId.value });
    await refreshStatus();
    stopLoop();
    msgSuccess("已暂停，可稍后继续");
  } catch (e:any) {
    msgError(e?.message || "暂停失败");
  } finally {
    pausing.value = false;
  }
}

lse;
  }
}