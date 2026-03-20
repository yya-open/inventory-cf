<template>
  <div style="max-width: 1180px; margin: 0 auto">
    <el-card shadow="never" style="border-radius: 12px; margin-bottom: 12px">
      <template #header>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap">
          <div>
            <div style="font-weight:700; font-size:16px">发布前检查</div>
            <div style="color:#888; font-size:12px; margin-top:4px">发布前先看数据库版本、健康状态、失败任务、最近错误和前端性能预算。</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
            <el-tag :type="summary.ready ? 'success' : 'danger'">{{ summary.ready ? '可以发布' : '暂不建议发布' }}</el-tag>
            <el-button size="small" @click="load(true)">刷新</el-button>
          </div>
        </div>
      </template>

      <el-row :gutter="12">
        <el-col :xs="24" :sm="12" :md="6"><MetricCard label="Schema" :value="summary.schemaOk ? '正常' : '异常'" :type="summary.schemaOk ? 'success' : 'danger'" /></el-col>
        <el-col :xs="24" :sm="12" :md="6"><MetricCard label="待处理问题" :value="String(summary.problemCount)" :type="summary.problemCount ? 'warning' : 'success'" /></el-col>
        <el-col :xs="24" :sm="12" :md="6"><MetricCard label="失败异步任务" :value="String(summary.failedJobs)" :type="summary.failedJobs ? 'warning' : 'success'" /></el-col>
        <el-col :xs="24" :sm="12" :md="6"><MetricCard label="近24h 5xx" :value="String(summary.error5xx)" :type="summary.error5xx ? 'warning' : 'success'" /></el-col>
      </el-row>
    </el-card>

    <el-card shadow="never" style="border-radius: 12px; margin-bottom: 12px">
      <template #header>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap">
          <div style="font-weight:700">检查清单</div>
          <el-button size="small" plain @click="go('/system/docs')">查看系统交付文档</el-button>
        </div>
      </template>
      <el-table :data="rows" border size="small">
        <el-table-column prop="name" label="检查项" min-width="180" />
        <el-table-column label="结果" width="110">
          <template #default="{ row }">
            <el-tag :type="row.ok ? 'success' : (row.level === 'warning' ? 'warning' : 'danger')">{{ row.ok ? '通过' : (row.level === 'warning' ? '关注' : '未通过') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="detail" label="说明" min-width="320" />
        <el-table-column prop="action" label="建议动作" min-width="240" />
      </el-table>
    </el-card>

    <el-card shadow="never" style="border-radius: 12px; margin-bottom: 12px">
      <template #header>
        <div style="font-weight:700">前端性能预算</div>
      </template>
      <el-table :data="budgetRows" border size="small">
        <el-table-column prop="label" label="预算项" min-width="180" />
        <el-table-column prop="limitText" label="预算上限" width="140" />
        <el-table-column prop="description" label="说明" min-width="300" />
      </el-table>
      <div style="margin-top:10px; color:#888; font-size:12px">
        本地执行 <code>npm run check:perf-budget</code> 可在构建后校验预算；<code>npm run verify:release</code> 已自动串上这一步。
      </div>
    </el-card>

    <el-card shadow="never" style="border-radius: 12px">
      <template #header>
        <div style="font-weight:700">本地发布命令</div>
      </template>
      <div style="display:grid; gap:10px">
        <pre class="cmd">npm run verify:release</pre>
        <pre class="cmd">npm run migrate:status -- --db inventory_db --remote</pre>
        <pre class="cmd">npm run migrate:apply -- --db inventory_db --remote</pre>
      </div>
      <div style="color:#888; font-size:12px; margin-top:10px">
        当前数据库版本：{{ schema.current_version || '-' }}；代码要求版本：{{ schema.required_version || '-' }}。
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, reactive, resolveComponent } from 'vue';
import { useRouter } from 'vue-router';
import { getSystemHealth, getSystemSchemaStatus } from '../api/systemHealth';
import { PERFORMANCE_BUDGETS, formatBudgetBytes } from '../constants/performanceBudget';

const MetricCard = defineComponent({
  name: 'MetricCard',
  props: {
    label: { type: String, required: true },
    value: { type: String, required: true },
    type: { type: String, default: 'info' },
  },
  setup(props) {
    return () => h(resolveComponent('ElCard'), { shadow: 'never', style: 'border-radius: 12px; min-height: 112px' }, {
      default: () => [
        h('div', { style: 'color:#888; font-size:12px; margin-bottom:8px' }, props.label),
        h('div', { style: 'display:flex; align-items:center; gap:8px' }, [
          h('div', { style: 'font-weight:700; font-size:28px; line-height:1' }, props.value),
          h(resolveComponent('ElTag'), { type: props.type as any, size: 'small' }, () => props.type === 'success' ? '正常' : props.type === 'warning' ? '关注' : '处理'),
        ]),
      ],
    });
  },
});

const router = useRouter();
const go = (path: string) => router.push(path);
const schema = reactive<any>({ ok: false, required_version: '', current_version: '', message: '' });
const health = reactive<any>({ scan: { total_problem_count: 0 }, metrics: { failed_async_jobs: 0, error_5xx_last_24h: 0 }, schema: { ok: false } });

const summary = computed(() => {
  const schemaOk = !!schema.ok;
  const problemCount = Number(health.scan?.total_problem_count || 0);
  const failedJobs = Number(health.metrics?.failed_async_jobs || 0);
  const error5xx = Number(health.metrics?.error_5xx_last_24h || 0);
  return {
    schemaOk,
    problemCount,
    failedJobs,
    error5xx,
    ready: schemaOk && problemCount === 0 && failedJobs === 0 && error5xx === 0,
  };
});

const rows = computed(() => [
  {
    name: '数据库版本 / Schema',
    ok: !!schema.ok,
    level: 'danger',
    detail: schema.ok ? `数据库已就绪，当前 ${schema.current_version || '-'}。` : (schema.message || '数据库结构未就绪'),
    action: schema.ok ? '无需处理' : '先执行远程迁移，再部署新代码',
  },
  {
    name: '运维巡检待处理问题',
    ok: Number(health.scan?.total_problem_count || 0) === 0,
    level: 'warning',
    detail: `当前待处理 ${Number(health.scan?.total_problem_count || 0)} 项。`,
    action: Number(health.scan?.total_problem_count || 0) === 0 ? '无需处理' : '先到运维工具完成修复或确认影响',
  },
  {
    name: '异步任务失败',
    ok: Number(health.metrics?.failed_async_jobs || 0) === 0,
    level: 'warning',
    detail: `失败任务 ${Number(health.metrics?.failed_async_jobs || 0)} 个。`,
    action: Number(health.metrics?.failed_async_jobs || 0) === 0 ? '无需处理' : '到运维工具 > 异步任务处理失败任务',
  },
  {
    name: '最近 24 小时 5xx',
    ok: Number(health.metrics?.error_5xx_last_24h || 0) === 0,
    level: 'warning',
    detail: `最近 24 小时记录到 ${Number(health.metrics?.error_5xx_last_24h || 0)} 次 5xx。`,
    action: Number(health.metrics?.error_5xx_last_24h || 0) === 0 ? '无需处理' : '先看错误请求和日志，确认不是新问题再发布',
  },
]);

const budgetRows = computed(() => PERFORMANCE_BUDGETS.map((item) => ({
  label: item.label,
  limitText: formatBudgetBytes(item.maxBytes),
  description: item.description,
})));

async function load(force = false) {
  const [schemaResp, healthResp] = await Promise.all([
    getSystemSchemaStatus({ force }),
    getSystemHealth({ force }),
  ]);
  Object.assign(schema, schemaResp?.data || {});
  Object.assign(health, healthResp?.data || {});
}

onMounted(() => load(false));
</script>

<style scoped>
.cmd {
  margin: 0;
  padding: 12px 14px;
  background: #f7f8fa;
  border-radius: 10px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.6;
}
</style>
