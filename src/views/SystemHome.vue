<template>
  <div style="max-width: 1180px; margin: 0 auto">
    <el-card shadow="never" style="border-radius: 12px; margin-bottom: 12px">
      <template #header>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap">
          <div style="font-weight:700">系统</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            <el-button v-if="canAccessParts" size="small" @click="go('/stock')">进入配件仓</el-button>
            <el-button v-if="canAccessPc" size="small" @click="go(preferredPcRoute(auth.user))">进入电脑/显示器仓</el-button>
          </div>
        </div>
      </template>

      <el-alert
        v-if="ops.problem_count || ops.failed_jobs || !ops.schema_ok"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 14px"
        :title="`当前有 ${Number(ops.problem_count || 0) + Number(ops.failed_jobs || 0) + (!ops.schema_ok ? 1 : 0)} 项系统关注点`"
      >
        <div>Schema {{ ops.schema_ok ? '正常' : '异常' }}；待处理问题 {{ ops.problem_count }}；失败任务 {{ ops.failed_jobs }}；最近巡检 {{ formatTime(ops.last_scan_at) || '-' }}</div>
      </el-alert>

      <div style="color:#888; font-size:12px; margin-bottom: 12px">以下功能为系统级配置/维护项，已从侧边栏主菜单收纳到此页面。</div>
      <el-row :gutter="12">
        <el-col :xs="24" :sm="12" :md="12" :lg="8"><HomeCard title="Excel 导入配件" desc="批量导入配件基础数据（SKU/名称/品牌/型号…）" @open="go('/import/items')" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="8"><HomeCard title="备份 / 恢复" desc="创建备份、恢复任务、下载备份文件" @open="go('/system/backup')" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="8"><HomeCard title="审计日志" desc="查看用户操作记录、筛选与导出" @open="go('/system/audit')" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="8" style="margin-top: 12px"><HomeCard title="用户管理" desc="新增/编辑用户、角色管理" @open="go('/system/users')" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="8" style="margin-top: 12px"><HomeCard title="系统配置" desc="设置扫码现场体验、默认页大小等系统级规则" @open="go('/system/settings')" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="8" style="margin-top: 12px">
          <el-card shadow="never" style="border-radius: 12px; height: 100%">
            <div style="font-weight:700; margin-bottom: 8px">运维工具</div>
            <div style="color:#777; font-size: 12px; margin-bottom: 10px">自动巡检、修复中心、异步任务、健康检查</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom: 10px">
              <el-tag :type="ops.schema_ok ? 'success' : 'danger'">{{ ops.schema_ok ? 'Schema 正常' : 'Schema 异常' }}</el-tag>
              <el-tag :type="ops.problem_count ? 'warning' : 'success'">待处理 {{ ops.problem_count }}</el-tag>
              <el-tag :type="ops.failed_jobs ? 'warning' : 'info'">失败任务 {{ ops.failed_jobs }}</el-tag>
            </div>
            <div style="color:#999; font-size:12px; line-height:1.7; min-height:52px">
              <div>最近巡检：{{ formatTime(ops.last_scan_at) || '-' }}</div>
              <div>最近演练：{{ formatTime(ops.last_backup_drill_at) || '-' }}</div>
              <div>演练闭环：{{ ops.open_backup_drill_issue_count || 0 }} 项待整改 / 逾期 {{ ops.overdue_backup_drill_issue_count || 0 }}</div>
            </div>
            <el-button type="primary" plain size="small" @click="go('/system/tools')">打开</el-button>
          </el-card>
        </el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="8" style="margin-top: 12px"><HomeCard title="发布前检查" desc="发布前统一确认数据库版本、巡检问题、失败任务与 5xx 情况" @open="go('/system/release-check')" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="8" style="margin-top: 12px"><HomeCard title="性能面板" desc="查看最近慢请求、错误路径、接口 P95，并持续定位性能瓶颈" @open="go('/system/performance')" /></el-col>
        <el-col :xs="24" :sm="12" :md="12" :lg="8" style="margin-top: 12px"><HomeCard title="系统交付文档" desc="发布顺序、运维按钮说明、常见异常处理与备份恢复 SOP" @open="go('/system/docs')" /></el-col>
      </el-row>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, reactive, resolveComponent } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../store/auth';
import { canAccessModuleArea, preferredPcRoute } from '../utils/moduleAccess';
import { getSystemHealth } from '../api/systemHealth';
import { scheduleOnIdle } from '../utils/idle';

const HomeCard = defineComponent({
  name: 'HomeCard',
  props: { title: { type: String, required: true }, desc: { type: String, required: true } },
  emits: ['open'],
  setup(props, { emit }) {
    return () => h(resolveComponent('ElCard'), { shadow: 'never', style: 'border-radius: 12px; height: 100%' }, {
      default: () => [
        h('div', { style: 'font-weight:700; margin-bottom: 8px' }, props.title),
        h('div', { style: 'color:#777; font-size: 12px; margin-bottom: 12px' }, props.desc),
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
function formatTime(v?: string | null) { return v ? String(v).replace('T', ' ').replace(/\.\d+Z?$/, '') : ''; }

async function loadOpsSummary() {
  const r:any = await getSystemHealth();
  ops.schema_ok = !!r.data?.schema?.ok;
  ops.problem_count = Number(r.data?.scan?.total_problem_count || 0);
  ops.failed_jobs = Number(r.data?.metrics?.failed_async_jobs || 0);
  ops.last_scan_at = r.data?.scan?.last_scanned_at || '';
  ops.last_backup_drill_at = r.data?.metrics?.last_backup_drill_at || '';
  ops.open_backup_drill_issue_count = Number(r.data?.metrics?.open_backup_drill_issue_count || 0);
  ops.overdue_backup_drill_issue_count = Number(r.data?.metrics?.overdue_backup_drill_issue_count || 0);
}

onMounted(() => {
  scheduleOnIdle(() => {
    void loadOpsSummary().catch(() => undefined);
  }, 1800);
});
</script>
