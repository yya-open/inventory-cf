<template>
  <div class="ui-page-shell data-quality-page">
    <div class="ui-page-heading">
      <div class="ui-page-heading__main">
        <div class="ui-page-heading__kicker">系统治理</div>
        <div class="ui-page-heading__title">数据质量中心</div>
        <div class="ui-page-heading__desc">集中扫描数据完整性问题，并记录负责人、处理状态与闭环说明。</div>
      </div>
      <div class="data-quality-page__actions">
        <el-tag type="danger" effect="plain">{{ errorCount }} 个错误</el-tag>
        <el-tag type="warning" effect="plain">{{ openCount }} 个待处理</el-tag>
        <el-button type="primary" :loading="scanning" @click="scan">执行扫描</el-button>
      </div>
    </div>

    <div class="ui-panel data-quality-page__filters">
      <el-radio-group v-model="statusFilter" @change="load">
        <el-radio-button label="">全部</el-radio-button>
        <el-radio-button label="open">待处理</el-radio-button>
        <el-radio-button label="in_progress">处理中</el-radio-button>
        <el-radio-button label="ignored">已忽略</el-radio-button>
        <el-radio-button label="resolved">已解决</el-radio-button>
      </el-radio-group>
      <span v-if="lastScanAt" class="data-quality-page__scan-time">最近扫描：{{ formatTime(lastScanAt) }}</span>
    </div>

    <div class="ui-panel ui-table-panel">
      <el-table v-loading="loading" :data="rows" row-key="id" empty-text="尚未发现质量问题，或请先执行扫描">
        <el-table-column label="级别" width="92">
          <template #default="{ row }"><el-tag :type="row.severity === 'error' ? 'danger' : 'warning'" effect="dark">{{ row.severity === 'error' ? '错误' : '提醒' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="title" label="问题" min-width="220">
          <template #default="{ row }"><div class="data-quality-page__title">{{ row.title }}</div><div class="data-quality-page__detail">{{ row.detail || row.issue_key }}</div></template>
        </el-table-column>
        <el-table-column prop="affected_count" label="影响记录" width="102" align="right" />
        <el-table-column label="状态" width="116"><template #default="{ row }"><el-tag :type="statusType(row.status)" effect="plain">{{ statusLabel(row.status) }}</el-tag></template></el-table-column>
        <el-table-column prop="owner" label="负责人" width="120"><template #default="{ row }">{{ row.owner || '-' }}</template></el-table-column>
        <el-table-column label="最近发现" width="172"><template #default="{ row }">{{ formatTime(row.last_seen_at) }}</template></el-table-column>
        <el-table-column label="操作" width="174" fixed="right">
          <template #default="{ row }">
            <div class="ui-row-actions">
              <el-button size="small" @click="openCase(row)">处理</el-button>
              <el-button v-if="row.status !== 'resolved'" size="small" type="success" plain @click="setStatus(row, 'resolved')">解决</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-drawer v-model="drawerVisible" title="处理数据质量问题" :size="isMobile ? '100%' : '480px'">
      <template v-if="activeCase">
        <div class="data-quality-page__drawer-title">{{ activeCase.title }}</div>
        <p class="data-quality-page__drawer-detail">{{ activeCase.detail }}</p>
        <el-form label-position="top">
          <el-form-item label="处理状态"><el-select v-model="edit.status"><el-option v-for="item in statuses" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
          <el-form-item label="负责人"><el-input v-model="edit.owner" placeholder="填写责任人" /></el-form-item>
          <el-form-item label="计划完成日期"><el-date-picker v-model="edit.due_at" type="date" value-format="YYYY-MM-DD" /></el-form-item>
          <el-form-item label="处理说明"><el-input v-model="edit.note" type="textarea" :rows="4" maxlength="1000" show-word-limit placeholder="记录处理结论、风险接受理由或后续动作" /></el-form-item>
        </el-form>
        <div v-if="activeCase.sample?.length" class="data-quality-page__sample"><div>样例记录</div><pre>{{ JSON.stringify(activeCase.sample, null, 2) }}</pre></div>
        <div class="data-quality-page__drawer-actions"><el-button @click="drawerVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveCase">保存处理结果</el-button></div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from '../utils/el-message';
import { listDataQualityCases, scanDataQualityCases, updateDataQualityCase, type DataQualityCase } from '../api/dataQuality';
import { isAppMobileViewport } from '../utils/responsive';

const rows = ref<DataQualityCase[]>([]);
const loading = ref(false);
const scanning = ref(false);
const saving = ref(false);
const statusFilter = ref('');
const lastScanAt = ref('');
const drawerVisible = ref(false);
const activeCase = ref<DataQualityCase | null>(null);
const edit = reactive<{ status: DataQualityCase['status']; owner: string; due_at: string; note: string }>({ status: 'open', owner: '', due_at: '', note: '' });
const statuses = [{ value: 'open', label: '待处理' }, { value: 'in_progress', label: '处理中' }, { value: 'ignored', label: '已忽略' }, { value: 'resolved', label: '已解决' }];
const isMobile = computed(() => isAppMobileViewport());
const openCount = computed(() => rows.value.filter((row) => ['open', 'in_progress'].includes(row.status)).length);
const errorCount = computed(() => rows.value.filter((row) => row.severity === 'error' && row.status !== 'resolved').length);

function formatTime(value?: string | null) { return value ? String(value).replace('T', ' ').replace(/\.\d+Z?$/, '') : '-'; }
function statusLabel(status: string) { return ({ open: '待处理', in_progress: '处理中', ignored: '已忽略', resolved: '已解决' } as Record<string, string>)[status] || status; }
function statusType(status: string) { return ({ open: 'danger', in_progress: 'warning', ignored: 'info', resolved: 'success' } as Record<string, any>)[status] || 'info'; }

async function load() {
  try { loading.value = true; const response = await listDataQualityCases(statusFilter.value); rows.value = response.data || []; } catch (error: any) { ElMessage.error(error?.message || '加载数据质量问题失败'); } finally { loading.value = false; }
}
async function scan() {
  try { scanning.value = true; const response = await scanDataQualityCases(); lastScanAt.value = new Date().toISOString(); ElMessage.success(`扫描完成，发现 ${Number(response.data?.issue_count || 0)} 类问题`); await load(); } catch (error: any) { ElMessage.error(error?.message || '扫描失败'); } finally { scanning.value = false; }
}
function openCase(row: DataQualityCase) { activeCase.value = row; edit.status = row.status; edit.owner = row.owner || ''; edit.due_at = row.due_at || ''; edit.note = row.note || ''; drawerVisible.value = true; }
async function setStatus(row: DataQualityCase, status: DataQualityCase['status']) { activeCase.value = row; edit.status = status; edit.owner = row.owner || ''; edit.due_at = row.due_at || ''; edit.note = row.note || ''; await saveCase(); }
async function saveCase() {
  if (!activeCase.value) return;
  try { saving.value = true; await updateDataQualityCase({ id: activeCase.value.id, ...edit }); ElMessage.success('处理结果已保存'); drawerVisible.value = false; await load(); } catch (error: any) { ElMessage.error(error?.message || '保存失败'); } finally { saving.value = false; }
}
onMounted(() => { void load(); });
</script>

<style scoped>
.data-quality-page__actions, .data-quality-page__filters, .data-quality-page__drawer-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.data-quality-page__filters { justify-content: space-between; padding: 12px 14px; }
.data-quality-page__scan-time, .data-quality-page__detail, .data-quality-page__drawer-detail { color: var(--ui-muted); font-size: 12px; }
.data-quality-page__title { font-weight: 700; }
.data-quality-page__detail { margin-top: 4px; line-height: 1.5; }
.data-quality-page__drawer-title { font-weight: 800; }
.data-quality-page__drawer-detail { margin: 8px 0 18px; }
.data-quality-page__sample { margin-top: 16px; color: var(--ui-muted); font-size: 12px; }
.data-quality-page__sample pre { max-height: 180px; overflow: auto; padding: 10px; border: 1px solid var(--ui-border-soft); border-radius: var(--ui-radius-sm); background: var(--ui-surface-soft); color: var(--ui-text); font-size: 11px; }
.data-quality-page__drawer-actions { justify-content: flex-end; margin-top: 20px; }
@media (max-width: 768px) { .data-quality-page__actions { justify-content: flex-start; } .data-quality-page__filters { align-items: flex-start; flex-direction: column; } }
</style>
