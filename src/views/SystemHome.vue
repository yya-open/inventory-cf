<template>
  <div style="max-width: 1180px; margin: 0 auto">
    <el-card shadow="never" style="border-radius: 12px">
      <template #header>
        <div style="display:flex; align-items:center; justify-content:space-between">
          <div style="font-weight:700; font-size:16px">系统</div>
          <div style="display:flex; gap:8px">
            <el-button size="small" @click="go('/stock')">进入配件仓</el-button>
            <el-button size="small" @click="go('/pc/assets')">进入电脑仓</el-button>
          </div>
        </div>
      </template>

      <el-alert title="以下功能为系统级配置/维护项，已从侧边栏主菜单收纳到此页面。" type="info" :closable="false" show-icon style="margin-bottom: 14px" />

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
              <el-tag type="warning">待处理 {{ ops.problem_count }}</el-tag>
              <el-tag type="info">失败任务 {{ ops.failed_jobs }}</el-tag>
            </div>
            <div style="color:#999; font-size:12px; line-height:1.7; min-height:52px">
              <div>最近巡检：{{ formatTime(ops.last_scan_at) || '-' }}</div>
              <div>最近演练：{{ formatTime(ops.last_backup_drill_at) || '-' }}</div>
            </div>
            <el-button type="primary" plain size="small" @click="go('/system/tools')">打开</el-button>
          </el-card>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, h, onMounted, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { getSystemHealth } from '../api/systemHealth';
import { ElButton, ElCard } from 'element-plus';

const HomeCard = defineComponent({
  name: 'HomeCard',
  props: { title: { type: String, required: true }, desc: { type: String, required: true } },
  emits: ['open'],
  setup(props, { emit }) {
    return () => h(ElCard, { shadow: 'never', style: 'border-radius: 12px; height: 100%' }, {
      default: () => [
        h('div', { style: 'font-weight:700; margin-bottom: 8px' }, props.title),
        h('div', { style: 'color:#777; font-size: 12px; margin-bottom: 12px' }, props.desc),
        h(ElButton, { type: 'primary', plain: true, size: 'small', onClick: () => emit('open') }, () => '打开'),
      ]
    });
  }
});

const router = useRouter();
const go = (path: string) => router.push(path);
const ops = reactive<any>({ schema_ok: true, problem_count: 0, failed_jobs: 0, last_scan_at: '', last_backup_drill_at: '' });
function formatTime(v?: string | null) { return v ? String(v).replace('T', ' ').replace(/\.\d+Z?$/, '') : ''; }

async function loadOpsSummary() {
  const r:any = await getSystemHealth();
  ops.schema_ok = !!r.data?.schema?.ok;
  ops.problem_count = Number(r.data?.scan?.total_problem_count || 0);
  ops.failed_jobs = Number(r.data?.metrics?.failed_async_jobs || 0);
  ops.last_scan_at = r.data?.scan?.last_scanned_at || '';
  ops.last_backup_drill_at = r.data?.metrics?.last_backup_drill_at || '';
}

onMounted(loadOpsSummary);
</script>
