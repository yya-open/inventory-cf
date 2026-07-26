<template>
  <el-row :gutter="16" class="u-mb-16">
    <el-col :xs="24" :md="12">
      <el-card shadow="never" class="u-border-card-simple">
        <template #header>
          <div class="u-row-between">
            <span class="u-fw-700">恢复演练 SOP</span>
            <el-tag type="warning" effect="light">建议每月一次</el-tag>
          </div>
        </template>
        <ol class="u-list-sop">
          <li>先下载一份最新完整备份，建议启用 gzip。</li>
          <li>在隔离环境上传备份，先执行“恢复前校验”。</li>
          <li>用 merge 或 merge_upsert 模式恢复，避免直接替换生产数据。</li>
          <li>验证用户、台账、盘点、审计、字典和系统配置是否完整。</li>
          <li>记录演练结果、问题和耗时，确认恢复 SOP 可执行。</li>
        </ol>
        <div class="u-flex u-gap-10 u-flex-wrap u-mt-12">
          <el-button plain @click="downloadDrillSop">下载 SOP</el-button>
          <el-button type="primary" plain @click="openDrillDialog">记录本次演练</el-button>
        </div>
      </el-card>
    </el-col>
    <el-col :xs="24" :md="12">
      <LazyMountBlock title="正在装载演练记录…" min-height="280px">
        <el-card shadow="never" class="u-border-card-simple">
          <template #header>
            <div class="u-row-between">
              <span class="u-fw-700">最近恢复演练</span>
              <el-button link type="primary" @click="loadBackupDrills">刷新</el-button>
            </div>
          </template>
          <div v-if="lastBackupDrillAt" class="u-text-muted u-fs-12 u-mb-8">最近一次：{{ lastBackupDrillAt }}</div>
          <el-table :data="backupDrills" border size="small" max-height="240">
            <el-table-column prop="drill_at" label="演练时间" width="180" />
            <el-table-column prop="outcome" label="结果" width="90" />
            <el-table-column prop="follow_up_status" label="闭环" width="110">
              <template #default="{ row }">
                <el-tag :type="row.follow_up_status === 'closed' ? 'success' : row.follow_up_status === 'open' ? 'warning' : 'info'">{{ row.follow_up_status === 'closed' ? '已闭环' : row.follow_up_status === 'open' ? '待整改' : '无需整改' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="issue_count" label="问题数" width="90" />
            <el-table-column prop="rect_owner" label="责任人" width="110" />
            <el-table-column prop="rect_due_at" label="整改截止" width="120" />
            <el-table-column prop="operator_name" label="执行人" width="110" />
            <el-table-column prop="scenario" label="场景" width="140" />
            <el-table-column prop="note" label="备注" min-width="180" show-overflow-tooltip />
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button link type="primary" @click="openDrillClosure(row)">闭环</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </LazyMountBlock>
    </el-col>
  </el-row>

  <el-dialog v-model="drillDialog" title="记录恢复演练" width="560px">
    <el-form label-width="90px">
      <el-form-item label="场景"><el-input v-model="drillForm.scenario" placeholder="restore_drill / validate_only" /></el-form-item>
      <el-form-item label="结果">
        <el-select v-model="drillForm.outcome" class="u-w-full">
          <el-option label="成功" value="success" />
          <el-option label="警告" value="warn" />
          <el-option label="失败" value="failed" />
        </el-select>
      </el-form-item>
      <el-form-item label="问题数"><el-input-number v-model="drillForm.issue_count" :min="0" :max="99" class="u-w-full" /></el-form-item>
      <el-form-item label="闭环状态">
        <el-select v-model="drillForm.follow_up_status" class="u-w-full">
          <el-option label="无需整改" value="not_required" />
          <el-option label="待整改" value="open" />
          <el-option label="已闭环" value="closed" />
        </el-select>
      </el-form-item>
      <el-form-item label="责任人"><el-input v-model="drillForm.rect_owner" placeholder="整改责任人" /></el-form-item>
      <el-form-item label="整改截止"><el-date-picker v-model="drillForm.rect_due_at" type="date" value-format="YYYY-MM-DD" class="u-w-full" /></el-form-item>
      <el-form-item label="备注"><el-input v-model="drillForm.note" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item>
      <el-form-item label="复盘结论"><el-input v-model="drillForm.review_note" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="drillDialog=false">取消</el-button>
      <el-button type="primary" @click="saveBackupDrill">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="drillClosureDialog" title="更新演练闭环" width="560px">
    <el-form label-width="96px">
      <el-form-item label="场景"><el-input v-model="drillClosureForm.scenario" /></el-form-item>
      <el-form-item label="结果">
        <el-select v-model="drillClosureForm.outcome" class="u-w-full">
          <el-option label="成功" value="success" />
          <el-option label="警告" value="warn" />
          <el-option label="失败" value="failed" />
        </el-select>
      </el-form-item>
      <el-form-item label="问题数"><el-input-number v-model="drillClosureForm.issue_count" :min="0" :max="99" class="u-w-full" /></el-form-item>
      <el-form-item label="闭环状态">
        <el-select v-model="drillClosureForm.follow_up_status" class="u-w-full">
          <el-option label="无需整改" value="not_required" />
          <el-option label="待整改" value="open" />
          <el-option label="已闭环" value="closed" />
        </el-select>
      </el-form-item>
      <el-form-item label="责任人"><el-input v-model="drillClosureForm.rect_owner" /></el-form-item>
      <el-form-item label="整改截止"><el-date-picker v-model="drillClosureForm.rect_due_at" type="date" value-format="YYYY-MM-DD" class="u-w-full" /></el-form-item>
      <el-form-item label="备注"><el-input v-model="drillClosureForm.note" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item>
      <el-form-item label="复盘结论"><el-input v-model="drillClosureForm.review_note" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="drillClosureDialog=false">取消</el-button>
      <el-button type="primary" @click="saveDrillClosure">保存闭环</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage } from "../utils/el-services";
import { apiGet, apiPost, apiPut } from "../api/client";
import { saveBlobAsFile } from "../utils/operationFeedback";
import { scheduleOnIdle } from "../utils/idle";
import LazyMountBlock from "./LazyMountBlock.vue";

function msgSuccess(message: string, duration = 2000) {
  return ElMessage({ type: "success", message, duration, showClose: true });
}

function msgError(message: string, duration = 4000) {
  return ElMessage({ type: "error", message, duration, showClose: true });
}

type BackupDrillRow = { id:number; drill_at:string; outcome:string; scenario:string; operator_name?:string; note?:string; issue_count?: number; follow_up_status?: 'open' | 'closed' | 'not_required'; rect_owner?: string; rect_due_at?: string; rect_closed_at?: string; review_note?: string };

const backupDrills = ref<BackupDrillRow[]>([]);
const lastBackupDrillAt = ref('');
const drillDialog = ref(false);
const drillClosureDialog = ref(false);
const drillForm = ref({ scenario: 'restore_drill', outcome: 'success', note: '', issue_count: 0, follow_up_status: 'not_required', rect_owner: '', rect_due_at: '', review_note: '' });
const drillClosureForm = ref<any>({ id: 0, scenario: 'restore_drill', outcome: 'success', note: '', issue_count: 0, follow_up_status: 'not_required', rect_owner: '', rect_due_at: '', review_note: '' });

function downloadDrillSop() {
  const content = [
    '备份/恢复演练 SOP',
    '',
    '1. 下载最新完整备份（推荐 gzip）。',
    '2. 在隔离环境导入备份文件并执行恢复前校验。',
    '3. 采用 merge 或 merge_upsert 模式恢复。',
    '4. 验证用户、电脑台账、显示器台账、盘点、审计日志、系统配置。',
    '5. 记录演练时间、结果、问题、恢复耗时。',
  ].join('\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  saveBlobAsFile(blob, 'backup_restore_drill_sop.txt', '下载');
}

function openDrillDialog() {
  drillDialog.value = true;
}

function openDrillClosure(row: BackupDrillRow) {
  drillClosureForm.value = {
    id: row.id,
    scenario: row.scenario || 'restore_drill',
    outcome: row.outcome || 'success',
    note: row.note || '',
    issue_count: Number(row.issue_count || 0),
    follow_up_status: row.follow_up_status || 'not_required',
    rect_owner: row.rect_owner || '',
    rect_due_at: row.rect_due_at || '',
    review_note: row.review_note || '',
  };
  drillClosureDialog.value = true;
}

async function loadBackupDrills() {
  try {
    const r:any = await apiGet('/api/backup-drills');
    backupDrills.value = Array.isArray(r.data) ? r.data : [];
    lastBackupDrillAt.value = backupDrills.value[0]?.drill_at || '';
  } catch {}
}

async function saveBackupDrill() {
  try {
    await apiPost('/api/backup-drills', drillForm.value);
    msgSuccess('演练记录已保存');
    drillDialog.value = false;
    drillForm.value = { scenario: 'restore_drill', outcome: 'success', note: '', issue_count: 0, follow_up_status: 'not_required', rect_owner: '', rect_due_at: '', review_note: '' };
    await loadBackupDrills();
  } catch (e:any) {
    msgError(e?.message || '保存演练记录失败');
  }
}

async function saveDrillClosure() {
  try {
    await apiPut('/api/backup-drills', drillClosureForm.value);
    msgSuccess('演练闭环已更新');
    drillClosureDialog.value = false;
    await loadBackupDrills();
  } catch (e:any) {
    msgError(e?.message || '更新演练闭环失败');
  }
}

onMounted(() => {
  scheduleOnIdle(() => {
    loadBackupDrills().catch(() => undefined);
  }, 1200);
});
</script>