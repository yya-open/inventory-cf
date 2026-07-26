<template>
  <el-dialog
    v-model="showRetention"
    title="审计保留与归档策略"
    width="760px"
  >
    <div class="u-text-muted u-mb-10">
      当前策略：保留近 <b>{{ retentionDays }}</b> 天；上次清理：{{ retentionLast || "-" }}；上次归档：{{ archiveLast || "-" }}
    </div>
    <el-alert
      v-if="auditWarnings.length"
      type="warning"
      show-icon
      :closable="false"
      class="u-mb-12"
    >
      <div v-for="item in auditWarnings" :key="item.code">{{ item.message }}</div>
    </el-alert>
    <div class="audit-retention-stats">
      <div class="stats-item"><span>审计行数</span><b>{{ auditStats.total_rows }}</b></div>
      <div class="stats-item"><span>可归档</span><b>{{ auditStats.eligible_rows }}</b></div>
      <div class="stats-item"><span>估算体积</span><b>{{ auditStats.approx_audit_mb }} MB</b></div>
      <div class="stats-item"><span>数据库体积</span><b>{{ auditStats.db_size_mb }} MB</b></div>
    </div>
    <el-form label-width="140px">
      <el-form-item label="保留天数">
        <el-input-number v-model="retentionDaysEdit" :min="1" :max="3650" controls-position="right" />
      </el-form-item>
      <el-form-item label="自动归档">
        <el-switch v-model="archiveEnabled" active-text="开启" inactive-text="关闭" />
      </el-form-item>
      <el-form-item label="归档门槛（天）">
        <el-input-number v-model="archiveAfterDays" :min="1" :max="3650" controls-position="right" />
      </el-form-item>
      <el-form-item label="归档后删除源记录">
        <el-switch v-model="deleteAfterArchive" active-text="是" inactive-text="否" />
      </el-form-item>
      <el-form-item label="单次归档上限">
        <el-input-number v-model="maxArchiveRows" :min="100" :max="50000" :step="500" controls-position="right" />
      </el-form-item>
      <el-form-item label="库体积预警 (MB)">
        <el-input-number v-model="warnDbSizeMb" :min="64" :max="4096" :step="16" controls-position="right" />
      </el-form-item>
      <el-form-item label="审计行数预警">
        <el-input-number v-model="warnAuditRows" :min="1000" :max="5000000" :step="1000" controls-position="right" />
      </el-form-item>
      <el-form-item label="审计体积预警 (MB)">
        <el-input-number v-model="warnAuditBytesMb" :min="16" :max="4096" :step="16" controls-position="right" />
      </el-form-item>
      <el-form-item label="立即清理">
        <el-switch v-model="runCleanup" active-text="是" inactive-text="否" />
      </el-form-item>
      <el-alert v-if="runCleanup" type="warning" show-icon :closable="false">将删除早于保留天数的审计日志。确认后不可恢复。</el-alert>
    </el-form>
    <div class="archive-history" v-if="archiveRuns.length">
      <div class="archive-history__title">最近归档</div>
      <div class="archive-history__list">
        <div v-for="run in archiveRuns" :key="run.id" class="archive-history__row">
          <span>{{ run.created_at }}</span>
          <span>截止 {{ run.archive_before }}</span>
          <span>导出 {{ run.exported_rows }}</span>
          <span v-if="run.deleted_rows">删除 {{ run.deleted_rows }}</span>
          <span>{{ run.result_filename || '-' }}</span>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="showRetention=false">取消</el-button>
      <el-button type="warning" :loading="archiveSubmitting" @click="createArchiveJob">立即归档</el-button>
      <el-button type="primary" :loading="retentionSaving" @click="saveRetention">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { apiGet, apiPost } from "../api/client";
import { ElMessage, ElMessageBox } from "../utils/el-services";

const showRetention = ref(false);
const retentionDays = ref(180);
const retentionLast = ref<string | null>(null);
const retentionDaysEdit = ref(180);
const archiveEnabled = ref(false);
const archiveAfterDays = ref(90);
const deleteAfterArchive = ref(false);
const maxArchiveRows = ref(5000);
const warnDbSizeMb = ref(350);
const warnAuditRows = ref(200000);
const warnAuditBytesMb = ref(128);
const archiveLast = ref<string | null>(null);
const archiveRuns = ref<any[]>([]);
const auditWarnings = ref<Array<{ code: string; message: string }>>([]);
const auditStats = ref({ total_rows: 0, eligible_rows: 0, approx_audit_mb: 0, db_size_mb: 0 });
const runCleanup = ref(false);
const retentionSaving = ref(false);
const archiveSubmitting = ref(false);

function applyRetentionState(data: any) {
  retentionDays.value = Number(data?.retention_days || 180);
  retentionLast.value = data?.last_cleanup_at || null;
  retentionDaysEdit.value = retentionDays.value;
  archiveEnabled.value = !!data?.archive_enabled;
  archiveAfterDays.value = Number(data?.archive_after_days || 90);
  deleteAfterArchive.value = !!data?.delete_after_archive;
  maxArchiveRows.value = Number(data?.max_archive_rows || 5000);
  warnDbSizeMb.value = Number(data?.warn_db_size_mb || 350);
  warnAuditRows.value = Number(data?.warn_audit_rows || 200000);
  warnAuditBytesMb.value = Number(data?.warn_audit_bytes_mb || 128);
  archiveLast.value = data?.last_archive_at || null;
  auditWarnings.value = Array.isArray(data?.warnings) ? data.warnings : [];
  auditStats.value = {
    total_rows: Number(data?.stats?.total_rows || 0),
    eligible_rows: Number(data?.stats?.eligible_rows || 0),
    approx_audit_mb: Number(data?.stats?.approx_audit_mb || 0),
    db_size_mb: Number(data?.stats?.db_size_mb || 0),
  };
  archiveRuns.value = Array.isArray(data?.archive_runs) ? data.archive_runs : [];
}

async function loadRetention() {
  try {
    const r = await apiGet<any>("/api/admin/audit/retention");
    applyRetentionState((r as any).data || {});
  } catch {
    // ignore (non-admins etc.)
  }
}

async function open() {
  runCleanup.value = false;
  await loadRetention();
  showRetention.value = true;
}

async function saveRetention() {
  try {
    retentionSaving.value = true;
    const payload: any = {
      retention_days: Number(retentionDaysEdit.value || 180),
      archive_enabled: archiveEnabled.value,
      archive_after_days: Number(archiveAfterDays.value || 90),
      delete_after_archive: deleteAfterArchive.value,
      max_archive_rows: Number(maxArchiveRows.value || 5000),
      warn_db_size_mb: Number(warnDbSizeMb.value || 350),
      warn_audit_rows: Number(warnAuditRows.value || 200000),
      warn_audit_bytes_mb: Number(warnAuditBytesMb.value || 128),
    };
    if (runCleanup.value) {
      const { value } = await ElMessageBox.prompt(
        "将删除早于保留天数的审计日志，输入“清理”确认：",
        "确认立即清理",
        { confirmButtonText: "确认", cancelButtonText: "取消", inputPlaceholder: "请输入：清理", inputValue: "" }
      );
      payload.run_cleanup = true;
      payload.confirm = value;
    }
    const r = await apiPost<any>("/api/admin/audit/retention", payload);
    ElMessage.success(runCleanup.value ? "已保存并清理" : "已保存");
    applyRetentionState((r as any).data || payload);
    runCleanup.value = false;
    showRetention.value = false;
  } catch (e: any) {
    if (e === "cancel" || e?.message === "cancel") return;
    ElMessage.error(e?.message || "保存失败");
  } finally {
    retentionSaving.value = false;
  }
}

async function createArchiveJob() {
  try {
    archiveSubmitting.value = true;
    const { value } = await ElMessageBox.prompt(
      "将生成审计归档文件，并根据策略可选删除源记录。输入“归档”确认：",
      "确认创建归档任务",
      { confirmButtonText: "确认", cancelButtonText: "取消", inputPlaceholder: "请输入：归档", inputValue: "" }
    );
    const r = await apiPost<any>("/api/admin/audit/retention", {
      retention_days: Number(retentionDaysEdit.value || 180),
      archive_enabled: archiveEnabled.value,
      archive_after_days: Number(archiveAfterDays.value || 90),
      delete_after_archive: deleteAfterArchive.value,
      max_archive_rows: Number(maxArchiveRows.value || 5000),
      warn_db_size_mb: Number(warnDbSizeMb.value || 350),
      warn_audit_rows: Number(warnAuditRows.value || 200000),
      warn_audit_bytes_mb: Number(warnAuditBytesMb.value || 128),
      run_archive: true,
      archive_confirm: value,
    });
    applyRetentionState((r as any).data || {});
    ElMessage.success(`审计归档任务已创建：#${(r as any).data?.archive_job_id || ''}`);
    showRetention.value = false;
  } catch (e: any) {
    if (e === 'cancel' || e?.message === 'cancel') return;
    ElMessage.error(e?.message || '创建归档任务失败');
  } finally {
    archiveSubmitting.value = false;
  }
}

defineExpose({ open });
</script>

<style scoped>
.audit-retention-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}
.audit-retention-stats .stats-item{border:1px solid var(--el-border-color);border-radius:var(--radius-md);padding:10px 12px;background:var(--el-fill-color-light)}
.audit-retention-stats .stats-item span{display:block;color:var(--el-text-color-secondary);font-size:12px;margin-bottom:4px}
.audit-retention-stats .stats-item b{font-size:18px}
.archive-history{margin-top:14px}
.archive-history__title{font-weight:700;margin-bottom:8px}
.archive-history__list{display:grid;gap:6px;max-height:160px;overflow:auto}
.archive-history__row{display:grid;grid-template-columns:1.4fr 1.2fr .8fr .8fr 1.6fr;gap:8px;font-size:12px;padding:8px 10px;border:1px solid var(--el-border-color-light);border-radius:var(--radius-sm)}

@media (max-width: 768px){
  .audit-retention-stats{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
  .archive-history__row{
    grid-template-columns:1fr;
    gap:4px;
  }
}

@media (max-width: 420px){
  .audit-retention-stats{
    grid-template-columns:1fr;
  }
}
</style>