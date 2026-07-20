<template>
  <div class="ui-page-shell sys-page">
    <div class="ui-page-heading">
      <div class="ui-page-heading__main">
        <div class="ui-page-heading__kicker">系统管理</div>
        <div class="ui-page-heading__title">系统首页</div>
        <div class="ui-page-heading__desc">集中进入备份、审计、用户、配置、运维、报表和交付文档。</div>
      </div>
      <div class="system-home-actions">
        <el-button v-if="canAccessParts" @click="go('/stock')">进入配件仓</el-button>
        <el-button v-if="canAccessPc" @click="go(preferredPcRoute(auth.user))">进入电脑/显示器仓</el-button>
      </div>
    </div>

    <div class="system-home-metrics" aria-label="系统工作摘要">
      <el-card shadow="never" class="sys-rounded-card system-home-metric">
        <div class="system-home-metric__label">待处理问题</div>
        <div class="system-home-metric__value" :class="{ 'is-warning': Number(ops.problem_count || 0) > 0 }">{{ opsLoaded ? ops.problem_count : '-' }}</div>
        <button type="button" class="system-home-metric__link" @click="go('/system/tools')">查看巡检与修复</button>
      </el-card>
      <el-card shadow="never" class="sys-rounded-card system-home-metric">
        <div class="system-home-metric__label">失败任务</div>
        <div class="system-home-metric__value" :class="{ 'is-warning': Number(ops.failed_jobs || 0) > 0 }">{{ opsLoaded ? ops.failed_jobs : '-' }}</div>
        <button type="button" class="system-home-metric__link" @click="go('/system/tasks')">打开任务中心</button>
      </el-card>
      <el-card shadow="never" class="sys-rounded-card system-home-metric">
        <div class="system-home-metric__label">备份演练待闭环</div>
        <div class="system-home-metric__value" :class="{ 'is-warning': Number(ops.open_backup_drill_issue_count || 0) > 0 }">{{ opsLoaded ? ops.open_backup_drill_issue_count : '-' }}</div>
        <button type="button" class="system-home-metric__link" @click="go('/system/backup')">查看备份与恢复</button>
      </el-card>
      <el-card shadow="never" class="sys-rounded-card system-home-metric">
        <div class="system-home-metric__label">数据库结构</div>
        <div class="system-home-metric__value" :class="{ 'is-danger': opsLoaded && !ops.schema_ok }">{{ opsLoaded ? (ops.schema_ok ? '正常' : '异常') : '-' }}</div>
        <button type="button" class="system-home-metric__link" @click="go('/system/release-check')">打开发布检查</button>
      </el-card>
    </div>

    <el-card shadow="never" class="sys-rounded-card sys-section-gap">
      <el-alert
        v-if="opsLoaded && (ops.problem_count || ops.failed_jobs || !ops.schema_ok)"
        type="warning"
        :closable="false"
        show-icon
        class="home-alert-gap"
        :title="`当前有 ${Number(ops.problem_count || 0) + Number(ops.failed_jobs || 0) + (!ops.schema_ok ? 1 : 0)} 项系统关注点`"
      >
        <div>Schema {{ ops.schema_ok ? '正常' : '异常' }}；待处理问题 {{ ops.problem_count }}；失败任务 {{ ops.failed_jobs }}；最近巡检 {{ formatTime(ops.last_scan_at) || '-' }}</div>
      </el-alert>

      <div class="sys-help-text home-help-gap">以下功能为系统级配置/维护项，已从侧边栏主菜单收纳到此页面。</div>
      <el-row :gutter="12">
        <el-col :xs="24" :sm="12" :md="12" :lg="8"><HomeCard title="备份 / 恢复" desc="创建备份、恢复任务、下载备份文件" @open="go('/system/backup')" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="8"><HomeCard title="数据报表中心" desc="集中查看看板、盘点和预警报表入口" @open="go('/system/reports')" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="8"><HomeCard title="批量任务中心" desc="查看异步导出、预计算和巡检任务进度" @open="go('/system/tasks')" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="8"><HomeCard title="审计日志" desc="查看用户操作记录、筛选与导出" @open="go('/system/audit')" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="8" class="home-col-gap"><HomeCard title="用户管理" desc="新增/编辑用户、角色管理" @open="go('/system/users')" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="8" class="home-col-gap"><HomeCard title="系统配置" desc="设置扫码现场体验、默认页大小等系统级规则" @open="go('/system/settings')" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="8" class="home-col-gap">
          <el-card shadow="never" class="sys-rounded-card home-full-card">
            <div class="sys-title-strong home-title-gap">运维工具</div>
            <div class="home-muted home-section-gap">自动巡检、修复中心、异步任务、健康检查</div>
            <div v-if="opsLoaded" class="sys-actions-row home-section-gap">
              <el-tag :type="ops.schema_ok ? 'success' : 'danger'">{{ ops.schema_ok ? 'Schema 正常' : 'Schema 异常' }}</el-tag>
              <el-tag :type="ops.problem_count ? 'warning' : 'success'">待处理 {{ ops.problem_count }}</el-tag>
              <el-tag :type="ops.failed_jobs ? 'warning' : 'info'">失败任务 {{ ops.failed_jobs }}</el-tag>
            </div>
            <div v-if="opsLoaded" class="home-subtle-block">
              <div>最近巡检：{{ formatTime(ops.last_scan_at) || '-' }}</div>
              <div>最近演练：{{ formatTime(ops.last_backup_drill_at) || '-' }}</div>
              <div>演练闭环：{{ ops.open_backup_drill_issue_count || 0 }} 项待整改 / 逾期 {{ ops.overdue_backup_drill_issue_count || 0 }}</div>
            </div>
            <div v-else class="home-subtle-block">系统摘要已延后加载，避免首屏额外请求占用。需要时可手动加载。</div>
            <div class="sys-actions-row">
              <el-button v-if="!opsLoaded" size="small" @click="loadOpsSummary({ force: true })">加载摘要</el-button>
              <el-button type="primary" plain size="small" @click="go('/system/tools')">打开</el-button>
            </div>
          </el-card>
        </el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="8" class="home-col-gap"><HomeCard title="发布前检查" desc="发布前统一确认数据库版本、巡检问题、失败任务与 5xx 情况" @open="go('/system/release-check')" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="8" class="home-col-gap"><HomeCard title="性能面板" desc="查看最近慢请求、错误路径、接口 P95，并持续定位性能瓶颈" @open="go('/system/performance')" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="8" class="home-col-gap"><HomeCard title="系统交付文档" desc="发布顺序、运维按钮说明、常见异常处理与备份恢复 SOP" @open="go('/system/docs')" /></el-col>
      </el-row>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, reactive, ref, resolveComponent } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../store/auth';
import { canAccessModuleArea, preferredPcRoute } from '../utils/moduleAccess';
import { getSystemHealth } from '../api/systemHealth';
import { getCachedResource } from '../utils/resourceCache';

const HomeCard = defineComponent({
  name: 'HomeCard',
  props: { title: { type: String, required: true }, desc: { type: String, required: true } },
  emits: ['open'],
  setup(props, { emit }) {
    return () => h(resolveComponent('ElCard'), { shadow: 'never', class: 'sys-rounded-card home-full-card' }, {
      default: () => [
        h('div', { class: 'sys-title-strong home-title-gap' }, props.title),
        h('div', { class: 'home-muted home-desc-gap' }, props.desc),
        h(resolveComponent('ElButton'), { type: 'primary', plain: true, size: 'small', onClick: () => emit('open') }, () => '打开'),
      ],
    });
  },
});

const router = useRouter();
const auth = useAuth();
const canAccessParts = computed(() => canAccessModuleArea(auth.user, 'parts'));
const canAccessPc = computed(() => canAccessModuleArea(auth.user, 'pc'));
const go = (path: string) => router.push(path);
const ops = reactive<any>({ schema_ok: true, problem_count: 0, failed_jobs: 0, last_scan_at: '', last_backup_drill_at: '', open_backup_drill_issue_count: 0, overdue_backup_drill_issue_count: 0 });
const opsLoaded = ref(false);
const SYSTEM_HOME_OPS_CACHE_KEY = 'system-home::ops-summary';
const SYSTEM_HOME_OPS_CACHE_TTL_MS = 3 * 60_000;
function formatTime(v?: string | null) { return v ? String(v).replace('T', ' ').replace(/\.\d+Z?$/, '') : ''; }

function applyOpsSummary(data: any) {
  ops.schema_ok = !!data?.schema_ok;
  ops.problem_count = Number(data?.problem_count || 0);
  ops.failed_jobs = Number(data?.failed_jobs || 0);
  ops.last_scan_at = data?.last_scan_at || '';
  ops.last_backup_drill_at = data?.last_backup_drill_at || '';
  ops.open_backup_drill_issue_count = Number(data?.open_backup_drill_issue_count || 0);
  ops.overdue_backup_drill_issue_count = Number(data?.overdue_backup_drill_issue_count || 0);
}

async function loadOpsSummary(options: { force?: boolean } = {}) {
  const payload = await getCachedResource(SYSTEM_HOME_OPS_CACHE_KEY, async () => {
    const r:any = await getSystemHealth();
    return {
      schema_ok: !!r.data?.schema?.ok,
      problem_count: Number(r.data?.scan?.total_problem_count || 0),
      failed_jobs: Number(r.data?.metrics?.failed_async_jobs || 0),
      last_scan_at: r.data?.scan?.last_scanned_at || '',
      last_backup_drill_at: r.data?.metrics?.last_backup_drill_at || '',
      open_backup_drill_issue_count: Number(r.data?.metrics?.open_backup_drill_issue_count || 0),
      overdue_backup_drill_issue_count: Number(r.data?.metrics?.overdue_backup_drill_issue_count || 0),
    };
  }, { ttlMs: SYSTEM_HOME_OPS_CACHE_TTL_MS, force: options.force });
  applyOpsSummary(payload);
  opsLoaded.value = true;
}

onMounted(() => {
  void loadOpsSummary().catch(() => {
    opsLoaded.value = true;
  });
});
</script>

<style scoped>
.system-home-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.home-alert-gap { margin-bottom: 14px; }
.home-help-gap { margin-bottom: 12px; }
.home-col-gap { margin-top: 12px; }
.home-full-card { height: 100%; }
.home-title-gap { margin-bottom: 8px; }
.home-desc-gap { margin-bottom: 12px; }
.home-section-gap { margin-bottom: 10px; }
.home-muted { color: var(--muted); font-size: 12px; }
.home-subtle-block { color: var(--subtle); font-size: 12px; line-height: 1.7; min-height: 52px; }
.system-home-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.system-home-metric { min-height: 142px; }
.system-home-metric__label { color: var(--ui-muted); font-size: 12px; font-weight: 600; }
.system-home-metric__value { margin: 10px 0 16px; color: var(--ui-text); font-size: 28px; font-weight: 800; line-height: 1; }
.system-home-metric__value.is-warning { color: var(--ui-warning); }
.system-home-metric__value.is-danger { color: var(--ui-danger); }
.system-home-metric__link { padding: 0; border: 0; background: transparent; color: var(--ui-primary); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.system-home-metric__link:hover, .system-home-metric__link:focus-visible { text-decoration: underline; }

@media (max-width: 768px) {
  .system-home-actions {
    justify-content: flex-start;
  }

  .system-home-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 420px) {
  .system-home-metrics { grid-template-columns: 1fr; }
}
</style>
