<template>
  <div style="padding:16px">
    <el-card>
      <template #header>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
          <div style="display:flex; flex-direction:column; gap:6px;">
            <div style="font-weight:700">报表与看板</div>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; color:#888; font-size:12px;">
              <span>经营 + 治理 + 稳定性统一口径</span>
              <el-tag size="small" :type="scopeTagType">{{ scopeLabel }}</el-tag>
              <el-tag v-if="data?.snapshot?.source" size="small" type="info">日汇总快照 {{ data?.snapshot?.day_count || 0 }} 天</el-tag>
            </div>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <el-segmented v-if="reportModeOptions.length" v-model="reportMode" :options="reportModeOptions" size="small" />
            <el-tag v-else type="warning">当前数据范围暂无可用看板</el-tag>
            <el-select v-model="days" style="width:160px" @change="refresh" :disabled="!reportModeOptions.length">
              <el-option :value="7" label="近 7 天" />
              <el-option :value="14" label="近 14 天" />
              <el-option :value="30" label="近 30 天" />
              <el-option :value="90" label="近 90 天" />
            </el-select>
            <el-button :loading="loading" @click="refresh">刷新</el-button>
          </div>
        </div>
      </template>

      <div v-if="data" :style="{ display: 'grid', gridTemplateColumns: summaryColumns, gap: '12px', marginBottom: '12px' }">
        <el-card shadow="never"><div style="color:#999;font-size:12px;">入库数量</div><div style="font-size:26px;font-weight:700;">{{ data.summary.in_qty ?? 0 }}</div></el-card>
        <el-card shadow="never"><div style="color:#999;font-size:12px;">出库数量</div><div style="font-size:26px;font-weight:700;">{{ data.summary.out_qty ?? 0 }}</div></el-card>
        <el-card v-if="reportMode==='parts'" shadow="never"><div style="color:#999;font-size:12px;">调整数量</div><div style="font-size:26px;font-weight:700;">{{ data.summary.adjust_qty ?? 0 }}</div></el-card>
        <el-card v-if="reportMode==='pc'" shadow="never"><div style="color:#999;font-size:12px;">回收/归还数量</div><div style="font-size:26px;font-weight:700;">{{ data.summary.recycle_qty ?? 0 }}</div></el-card>
        <el-card v-if="reportMode==='monitor'" shadow="never"><div style="color:#999;font-size:12px;">归还数量</div><div style="font-size:26px;font-weight:700;">{{ data.summary.return_qty ?? 0 }}</div></el-card>
        <el-card v-if="reportMode==='monitor'" shadow="never"><div style="color:#999;font-size:12px;">调拨数量</div><div style="font-size:26px;font-weight:700;">{{ data.summary.transfer_qty ?? 0 }}</div></el-card>
        <el-card v-if="reportMode==='pc' || reportMode==='monitor'" shadow="never"><div style="color:#999;font-size:12px;">报废数量</div><div style="font-size:26px;font-weight:700;">{{ data.summary.scrap_qty ?? 0 }}</div></el-card>
        <el-card shadow="never"><div style="color:#999;font-size:12px;">明细笔数</div><div style="font-size:26px;font-weight:700;">{{ data.summary.tx_count ?? 0 }}</div></el-card>
      </div>

      <div v-if="data" style="display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px; margin-bottom:12px;">
        <el-card shadow="never">
          <div style="color:#999;font-size:12px;">生命周期治理</div>
          <div style="font-size:22px;font-weight:700;">{{ governanceArchiveCount }}</div>
          <div style="font-size:12px;color:#888; margin-top:6px;">当前归档资产</div>
        </el-card>
        <el-card shadow="never">
          <div style="color:#999;font-size:12px;">生命周期动作</div>
          <div style="font-size:22px;font-weight:700;">{{ (data.governance?.archive_events_30d ?? 0) + (data.governance?.restore_events_30d ?? 0) + (data.governance?.purge_events_30d ?? 0) }}</div>
          <div style="font-size:12px;color:#888; margin-top:6px;">近 {{ days }} 天归档/恢复/清理</div>
        </el-card>
        <el-card shadow="never">
          <div style="color:#999;font-size:12px;">演练闭环</div>
          <div style="font-size:22px;font-weight:700;">{{ data.stability?.open_drill_issue_count ?? 0 }}</div>
          <div style="font-size:12px;color:#888; margin-top:6px;">未闭环演练问题，逾期 {{ data.stability?.overdue_drill_issue_count ?? 0 }}</div>
        </el-card>
        <el-card shadow="never">
          <div style="color:#999;font-size:12px;">稳定性告警</div>
          <div style="font-size:22px;font-weight:700;">{{ data.stability?.active_alert_count ?? 0 }}</div>
          <div style="font-size:12px;color:#888; margin-top:6px;">失败任务 {{ data.stability?.failed_async_jobs ?? 0 }} / 24h 5xx {{ data.stability?.error_5xx_last_24h ?? 0 }}</div>
        </el-card>
      </div>

      <div v-if="data" style="display:grid; grid-template-columns: 1.1fr 0.9fr; gap:12px;">
        <el-card shadow="never">
          <template #header>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
              <div><b>近 {{ days }} 天{{ activeTypeLabel }}趋势</b><span style="color:#999;font-size:12px;">（{{ data.range.from }} ~ {{ data.range.to }}）</span></div>
              <el-segmented v-model="activeType" :options="typeOptions" size="small" />
            </div>
          </template>
          <div style="display:flex; flex-direction:column; gap:6px;">
            <div v-for="r in seriesFilled" :key="r.day" style="display:flex; align-items:center; gap:10px;">
              <div style="width:96px; color:#666; font-size:12px;">{{ r.day }}</div>
              <div style="flex:1; background:#f2f3f5; height:10px; border-radius:6px; overflow:hidden;"><div :style="{ width: barWidth(r.qty) }" style="height:10px; background:#409eff;" /></div>
              <div style="width:60px; text-align:right; color:#333; font-size:12px;">{{ r.qty }}</div>
            </div>
          </div>
        </el-card>

        <el-card shadow="never">
          <template #header><b>{{ activeTypeLabel }} Top 10</b></template>
          <el-table :data="topTable" size="small" border height="360">
            <el-table-column prop="sku" :label="reportMode==='parts' ? 'SKU' : '型号'" width="140" />
            <el-table-column prop="name" label="名称" min-width="140" />
            <el-table-column prop="qty" label="数量" width="80" />
          </el-table>
          <div style="margin-top:10px;">
            <b>{{ categoryTitle }}</b>
            <el-table :data="categoryTable" size="small" border height="240" style="margin-top:8px;">
              <el-table-column prop="category" label="分类" min-width="140" />
              <el-table-column prop="qty" label="数量" width="90" />
            </el-table>
          </div>
        </el-card>
      </div>

      <div v-else-if="!reportModeOptions.length" style="padding:16px;">
        <el-empty description="当前账号的数据范围已限制到未接入看板口径的仓域，请联系管理员调整为电脑仓、显示器仓或配件仓，或保留当前账号仅用于台账访问。" />
      </div>
      <div v-else style="color:#999; padding:16px;">加载中…</div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { ElMessage } from "../utils/el-services";
import { apiGet } from "../api/client";
import { useFixedWarehouseId } from "../utils/warehouse";
import { addDaysYmd } from "../utils/datetime";
import { useAuth } from "../store/auth";
import { dataScopeLabel, scopeModeOptions } from "../utils/dataScope";

const warehouseId = useFixedWarehouseId();
const auth = useAuth();
const days = ref(30);
const reportMode = ref<"parts"|"pc"|"monitor">("parts");
const data = ref<any|null>(null);
const loading = ref(false);

const reportModeOptions = computed(() => {
  const allowed = scopeModeOptions(auth.user?.data_scope_type, auth.user?.data_scope_value, auth.user?.data_scope_value2);
  return allowed.map((value) => ({ label: value === 'parts' ? '配件仓' : value === 'pc' ? '电脑仓' : '显示器仓', value }));
});
const scopeLabel = computed(() => dataScopeLabel(auth.user?.data_scope_type, auth.user?.data_scope_value, auth.user?.data_scope_value2));
const scopeTagType = computed(() => auth.user?.data_scope_type && auth.user?.data_scope_type !== 'all' ? 'warning' : 'success');

const activeType = ref<string>("OUT");
const typeOptions = computed(() => {
  if (reportMode.value === 'pc') return [{ label: '出库', value: 'OUT' }, { label: '入库', value: 'IN' }, { label: '归还', value: 'RETURN' }, { label: '回收', value: 'RECYCLE' }, { label: '报废', value: 'SCRAP' }];
  if (reportMode.value === 'monitor') return [{ label: '出库', value: 'OUT' }, { label: '入库', value: 'IN' }, { label: '归还', value: 'RETURN' }, { label: '调拨', value: 'TRANSFER' }, { label: '报废', value: 'SCRAP' }];
  return [{ label: '出库', value: 'OUT' }, { label: '入库', value: 'IN' }];
});
const activeTypeLabel = computed(() => ({ OUT:'出库', IN:'入库', RETURN:'归还', RECYCLE:'回收', SCRAP:'报废', TRANSFER: '调拨' } as Record<string,string>)[activeType.value] || activeType.value);
const governanceArchiveCount = computed(() => Number(data.value?.governance?.archived_pc_count || 0) + Number(data.value?.governance?.archived_monitor_count || 0));
const summaryColumns = computed(() => reportMode.value === 'parts' ? 'repeat(4, minmax(0,1fr))' : reportMode.value === 'monitor' ? 'repeat(6, minmax(0,1fr))' : 'repeat(5, minmax(0,1fr))');

function pickByType(prefix: string, t: string) {
  const key = `${prefix}_${String(t || '').toLowerCase()}`;
  return data.value?.[key] || [];
}

const topTable = computed(() => !data.value ? [] : pickByType('top', activeType.value));
const categoryTable = computed(() => !data.value ? [] : pickByType('category', activeType.value));
const categoryTitle = computed(() => {
  if (reportMode.value === 'parts') return `按分类${activeTypeLabel.value}`;
  if (reportMode.value === 'monitor') {
    if (activeType.value === 'OUT') return '按部门出库';
    if (activeType.value === 'IN') return '按品牌入库';
    if (activeType.value === 'RETURN') return '按部门归还';
    if (activeType.value === 'TRANSFER') return '按部门调拨';
    if (activeType.value === 'SCRAP') return '按报废原因';
    return '分类';
  }
  if (activeType.value === 'OUT') return '按部门出库';
  if (activeType.value === 'IN') return '按品牌入库';
  if (activeType.value === 'RETURN') return '按部门归还';
  if (activeType.value === 'RECYCLE') return '按部门回收';
  if (activeType.value === 'SCRAP') return '按报废原因';
  return '分类';
});

function normalizeErrorMessage(message?: string) {
  const raw = String(message || '').trim();
  if (!raw) return '加载报表失败';
  if (raw.startsWith('<!DOCTYPE') || raw.startsWith('<html')) return '报表接口执行超限，请刷新后重试；本次已修复快照循环问题，重新部署后应恢复正常。';
  return raw;
}

async function refresh(){
  if (!reportModeOptions.value.length) {
    data.value = null;
    return;
  }
  loading.value = true;
  try{
    const r:any = await apiGet(`/api/reports/summary?warehouse_id=${warehouseId.value}&days=${days.value}&mode=${reportMode.value}`);
    data.value = r;
  }catch(e:any){
    ElMessage.error(normalizeErrorMessage(e.message));
  }finally{
    loading.value = false;
  }
}

const seriesFilled = computed(()=>{
  if (!data.value) return [];
  const raw = pickByType('daily', activeType.value);
  const map = new Map<string, number>();
  for (const r of raw) map.set(r.day, Number(r.qty));
  const out: any[] = [];
  const to = String(data.value.range.to || "");
  const from = String(data.value.range.from || "");
  if (!from || !to) return raw;
  let cur = from;
  while (cur <= to) {
    out.push({ day: cur, qty: map.get(cur) ?? 0 });
    cur = addDaysYmd(cur, 1);
  }
  return out;
});

function barWidth(qty:number){
  const max = Math.max(...seriesFilled.value.map((x:any)=>x.qty), 1);
  const pct = Math.round((qty / max) * 100);
  return `${pct}%`;
}

watch(reportModeOptions, (opts) => {
  const allowed = opts.map((x:any) => x.value);
  if (!allowed.length) {
    data.value = null;
    return;
  }
  if (!allowed.includes(reportMode.value)) reportMode.value = allowed[0] || 'pc';
}, { immediate: true });

watch(reportMode, () => {
  const allowed = typeOptions.value.map((x:any) => x.value);
  if (!allowed.includes(activeType.value)) activeType.value = 'OUT';
  refresh();
});

onMounted(async ()=>{
  const allowed = reportModeOptions.value.map((x:any) => x.value);
  if (allowed.length === 1) reportMode.value = allowed[0];
  await refresh();
});
</script>
