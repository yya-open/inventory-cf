<template>
  <div class="system-reports-center">
    <el-card shadow="never" class="hero-card">
      <div class="hero-head">
        <div>
          <div class="hero-title">数据报表中心</div>
          <div class="hero-desc">把系统级看板、盘点报表、报废预警和台账分析入口集中到一起，方便日常复盘和管理查看。</div>
        </div>
        <div class="hero-actions">
          <el-button @click="go('/system/dashboard')">打开完整看板</el-button>
          <el-button @click="go('/system/tasks')">查看任务中心</el-button>
        </div>
      </div>
      <el-row :gutter="12">
        <el-col v-for="item in quickCards" :key="item.title" :xs="24" :sm="12" :lg="6">
          <el-card shadow="hover" class="quick-card" @click="go(item.path)">
            <div class="quick-title">{{ item.title }}</div>
            <div class="quick-desc">{{ item.desc }}</div>
          </el-card>
        </el-col>
      </el-row>
    </el-card>

    <el-card shadow="never" class="snapshot-card">
      <div class="snapshot-head">
        <div>
          <div class="section-title">轻量摘要</div>
          <div class="section-desc">首屏优先用缓存摘要秒开，再在后台静默刷新。</div>
        </div>
        <div class="snapshot-meta">{{ summaryMeta }}</div>
      </div>
      <el-row :gutter="12" class="summary-row">
        <el-col :xs="12" :md="6"><el-card shadow="never" class="summary-card"><div class="summary-label">异步任务总数</div><div class="summary-value">{{ summary.async_job_count }}</div></el-card></el-col>
        <el-col :xs="12" :md="6"><el-card shadow="never" class="summary-card"><div class="summary-label">失败任务</div><div class="summary-value">{{ summary.failed_job_count }}</div></el-card></el-col>
        <el-col :xs="12" :md="6"><el-card shadow="never" class="summary-card"><div class="summary-label">近 30 天归档动作</div><div class="summary-value">{{ summary.archive_events_30d }}</div></el-card></el-col>
        <el-col :xs="12" :md="6"><el-card shadow="never" class="summary-card"><div class="summary-label">24h 5xx</div><div class="summary-value">{{ summary.error_5xx_last_24h }}</div></el-card></el-col>
      </el-row>
    </el-card>

    <el-row :gutter="12" class="insight-row">
      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="insight-card">
          <template #header>
            <div class="section-header compact">
              <div>
                <div class="section-title">快速洞察</div>
                <div class="section-desc">首屏先加载轻量摘要，不直接压完整 Dashboard。</div>
              </div>
              <el-button size="small" @click="loadSummary(true)">刷新摘要</el-button>
            </div>
          </template>
          <div class="insight-grid">
            <div class="insight-item"><span class="insight-k">系统状态</span><strong>{{ summary.failed_job_count > 0 || summary.error_5xx_last_24h > 0 ? '需关注' : '平稳' }}</strong></div>
            <div class="insight-item"><span class="insight-k">任务积压</span><strong>{{ summary.async_job_count > 0 ? Math.max(0, summary.async_job_count - summary.failed_job_count) : 0 }}</strong></div>
            <div class="insight-item"><span class="insight-k">归档密度</span><strong>{{ archiveDensityLabel }}</strong></div>
            <div class="insight-item"><span class="insight-k">报表模式</span><strong>{{ dashboardEnabled ? '完整看板已启用' : '轻量摘要模式' }}</strong></div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="insight-card">
          <template #header>
            <div class="section-header compact">
              <div>
                <div class="section-title">常用入口</div>
                <div class="section-desc">点击即进入下钻页面，避免完整看板首屏一次性加载。</div>
              </div>
            </div>
          </template>
          <div class="entry-list">
            <el-button text @click="go('/pc/assets')">电脑台账分析</el-button>
            <el-button text @click="go('/pc/monitors')">显示器台账分析</el-button>
            <el-button text @click="go('/stocktake')">库存盘点与结果导出</el-button>
            <el-button text @click="go('/pc/age-warnings')">报废预警</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never">
      <template #header>
        <div class="section-header">
          <div>
            <div class="section-title">经营看板总览</div>
            <div class="section-desc">完整 Dashboard 只有在你显式启用后才会加载，并且会记住你的偏好。</div>
          </div>
          <div class="section-actions">
            <el-button v-if="!dashboardEnabled" type="primary" @click="enableDashboard">加载完整看板</el-button>
            <template v-else>
              <el-button @click="refreshKey += 1">刷新看板组件</el-button>
              <el-button @click="disableDashboard">关闭完整看板</el-button>
            </template>
          </div>
        </div>
      </template>

      <template v-if="dashboardEnabled">
        <Suspense>
          <template #default>
            <AsyncDashboard :key="refreshKey" />
          </template>
          <template #fallback>
            <div class="dashboard-skeleton">
              <el-skeleton :rows="8" animated />
            </div>
          </template>
        </Suspense>
      </template>
      <div v-else class="dashboard-placeholder">
        <el-empty description="当前保持轻量摘要模式。只有你点击“加载完整看板”后，系统才会异步挂载 Dashboard。" />
      </div>
    </el-card>
  </div>
</template>
<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiGet } from '../api/client';

const SUMMARY_CACHE_KEY = 'system_reports_center_summary_cache';
const DASHBOARD_PREF_KEY = 'system_reports_center_enable_dashboard';
const SUMMARY_TTL_MS = 60_000;
const AsyncDashboard = defineAsyncComponent(() => import('./Dashboard.vue'));
const router = useRouter();
const refreshKey = ref(0);
const dashboardEnabled = ref(false);
const summary = reactive({ async_job_count: 0, failed_job_count: 0, archive_events_30d: 0, error_5xx_last_24h: 0 });
const summaryLoadedAt = ref(0);
const quickCards = [
  { title: '系统看板', desc: '库存、出入库、治理与稳定性总览。', path: '/system/dashboard' },
  { title: '报废预警', desc: '按电脑寿命年限查看即将到期和需处置资产。', path: '/pc/age-warnings' },
  { title: '库存盘点', desc: '进入库存盘点中心，导出盘点结果报表。', path: '/stocktake' },
  { title: '电脑台账', desc: '按电脑台账继续下钻分析，查看明细与导出。', path: '/pc/assets' },
  { title: '显示器台账', desc: '进入显示器台账查看状态、归属与二维码。', path: '/pc/monitors' },
  { title: '任务中心', desc: '批量导出、预计算、巡检任务进度与下载。', path: '/system/tasks' },
];
const archiveDensityLabel = computed(() => {
  const archiveEvents = Number(summary.archive_events_30d || 0);
  if (archiveEvents >= 50) return '高';
  if (archiveEvents >= 10) return '中';
  return '低';
});
const summaryMeta = computed(() => summaryLoadedAt.value ? `摘要更新时间：${formatTime(summaryLoadedAt.value)}` : '正在获取摘要');
function formatTime(value: number | string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value || '-');
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function go(path: string) { router.push(path); }
function applySummary(dashboard: any) {
  summary.async_job_count = Number(dashboard.async_job_count || 0);
  summary.failed_job_count = Number(dashboard.failed_job_count || 0);
  summary.archive_events_30d = Number((dashboard.archive_events_30d || 0)) + Number((dashboard.restore_events_30d || 0)) + Number((dashboard.purge_events_30d || 0));
  summary.error_5xx_last_24h = Number(dashboard.error_5xx_last_24h || 0);
}
function loadCachedSummary() {
  try {
    const raw = sessionStorage.getItem(SUMMARY_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    if (parsed.dashboard) applySummary(parsed.dashboard);
    summaryLoadedAt.value = Number(parsed.ts || 0);
  } catch {}
}
function saveCachedSummary(dashboard: any) {
  try {
    sessionStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify({ ts: Date.now(), dashboard }));
  } catch {}
}
async function loadSummary(force = false) {
  if (!force && summaryLoadedAt.value && (Date.now() - summaryLoadedAt.value) < SUMMARY_TTL_MS) {
    void refreshSummaryInBackground();
    return;
  }
  const r:any = await apiGet('/api/system-tools?section=base');
  const dashboard = r?.data?.dashboard || {};
  applySummary(dashboard);
  summaryLoadedAt.value = Date.now();
  saveCachedSummary(dashboard);
}
async function refreshSummaryInBackground() {
  try {
    const r:any = await apiGet('/api/system-tools?section=base');
    const dashboard = r?.data?.dashboard || {};
    applySummary(dashboard);
    summaryLoadedAt.value = Date.now();
    saveCachedSummary(dashboard);
  } catch {}
}
function enableDashboard() {
  dashboardEnabled.value = true;
  try { localStorage.setItem(DASHBOARD_PREF_KEY, '1'); } catch {}
}
function disableDashboard() {
  dashboardEnabled.value = false;
  try { localStorage.setItem(DASHBOARD_PREF_KEY, '0'); } catch {}
}
onMounted(() => {
  loadCachedSummary();
  try { dashboardEnabled.value = localStorage.getItem(DASHBOARD_PREF_KEY) === '1'; } catch { dashboardEnabled.value = false; }
  void loadSummary();
});
</script>
<style scoped>
.system-reports-center{display:flex;flex-direction:column;gap:12px}.hero-card{border-radius:16px}.hero-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px}.hero-title{font-size:20px;font-weight:800}.hero-desc,.section-desc{font-size:13px;color:#6b7280;margin-top:4px}.hero-actions,.section-actions{display:flex;gap:8px;flex-wrap:wrap}.quick-card{cursor:pointer;border-radius:14px;min-height:116px}.quick-title{font-size:16px;font-weight:700;margin-bottom:8px}.quick-desc{font-size:13px;color:#6b7280;line-height:1.5}.snapshot-card{border-radius:14px}.snapshot-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:8px}.snapshot-meta{font-size:12px;color:#6b7280}.section-header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.section-header.compact{align-items:flex-start}.section-title{font-size:16px;font-weight:700}.summary-row{margin:0}.summary-card,.insight-card{border-radius:14px}.summary-label{font-size:12px;color:#6b7280}.summary-value{font-size:28px;font-weight:800;margin-top:6px}.insight-row{margin:0}.insight-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.insight-item{padding:12px;border:1px solid #e5e7eb;border-radius:12px;background:#fafafa;display:flex;justify-content:space-between;gap:12px}.insight-k{font-size:12px;color:#6b7280}.entry-list{display:grid;gap:6px;justify-items:start}.dashboard-placeholder,.dashboard-skeleton{padding:8px 0}@media (max-width:768px){.insight-grid{grid-template-columns:1fr}}
</style>
