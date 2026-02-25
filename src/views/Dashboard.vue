<template>
  <div style="padding:16px">
    <el-card>
      <template #header>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-weight:700">报表与看板</div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <el-segmented v-model="reportMode" :options="reportModeOptions" size="small" />
            <el-select v-model="days" style="width:160px" @change="refresh">
              <el-option :value="7" label="近 7 天" />
              <el-option :value="14" label="近 14 天" />
              <el-option :value="30" label="近 30 天" />
              <el-option :value="90" label="近 90 天" />
            </el-select>
            <el-button @click="refresh" :loading="loading">刷新</el-button>
          </div>
        </div>
      </template>

      <div
        v-if="data"
        :style="{
          display: 'grid',
          gridTemplateColumns: reportMode === 'pc' ? 'repeat(5, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))',
          gap: '12px',
          marginBottom: '12px'
        }"
      >
        <el-card shadow="never"><div style="color:#999;font-size:12px;">入库数量</div><div style="font-size:26px;font-weight:700;">{{ data.summary.in_qty }}</div></el-card>
        <el-card shadow="never"><div style="color:#999;font-size:12px;">出库数量</div><div style="font-size:26px;font-weight:700;">{{ data.summary.out_qty }}</div></el-card>
        <el-card shadow="never">
          <div style="color:#999;font-size:12px;">{{ reportMode==='pc' ? '回收/归还数量' : '调整数量' }}</div>
          <div style="font-size:26px;font-weight:700;">{{ reportMode==='pc' ? (data.summary.recycle_qty ?? 0) : (data.summary.adjust_qty ?? 0) }}</div>
        </el-card>
        <el-card v-if="reportMode==='pc'" shadow="never">
          <div style="color:#999;font-size:12px;">报废数量</div>
          <div style="font-size:26px;font-weight:700;">{{ data.summary.scrap_qty ?? 0 }}</div>
        </el-card>
        <el-card shadow="never"><div style="color:#999;font-size:12px;">明细笔数</div><div style="font-size:26px;font-weight:700;">{{ data.summary.tx_count }}</div></el-card>
      </div>

      <div v-if="data" style="display:grid; grid-template-columns: 1.1fr 0.9fr; gap:12px;">
        <el-card shadow="never">
          <template #header>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
              <div>
                <b>近 {{ days }} 天{{ activeTypeLabel }}趋势</b>
                <span style="color:#999;font-size:12px;">（{{ data.range.from }} ~ {{ data.range.to }}）</span>
              </div>
              <el-segmented v-model="activeType" :options="typeOptions" size="small" />
            </div>
          </template>
          <div style="display:flex; flex-direction:column; gap:6px;">
            <div v-for="r in seriesFilled" :key="r.day" style="display:flex; align-items:center; gap:10px;">
              <div style="width:96px; color:#666; font-size:12px;">{{ r.day }}</div>
              <div style="flex:1; background:#f2f3f5; height:10px; border-radius:6px; overflow:hidden;">
                <div :style="{ width: barWidth(r.qty) }" style="height:10px; background:#409eff;"></div>
              </div>
              <div style="width:60px; text-align:right; color:#333; font-size:12px;">{{ r.qty }}</div>
            </div>
          </div>
        </el-card>

        <el-card shadow="never">
          <template #header><b>{{ activeTypeLabel }} Top 10</b></template>
          <el-table :data="topTable" size="small" border height="360">
            <el-table-column prop="sku" :label="reportMode==='pc' ? '型号' : 'SKU'" width="140"/>
            <el-table-column prop="name" label="名称" min-width="140"/>
            <el-table-column prop="qty" label="数量" width="80"/>
          </el-table>

          <div style="margin-top:10px;">
            <b>{{ categoryTitle }}</b>
            <el-table :data="categoryTable" size="small" border height="240" style="margin-top:8px;">
              <el-table-column prop="category" label="分类" min-width="140"/>
              <el-table-column prop="qty" label="数量" width="90"/>
            </el-table>
          </div>
        </el-card>
      </div>

      <div v-else style="color:#999; padding:16px;">加载中…</div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { ElMessage } from "element-plus";
import { apiGet } from "../api/client";
import { useFixedWarehouseId } from "../utils/warehouse";
import { addDaysYmd } from "../utils/datetime";

const warehouseId = useFixedWarehouseId();
const days = ref(30);
const reportMode = ref<"parts"|"pc">("parts");
const reportModeOptions = [
  { label: "配件仓", value: "parts" },
  { label: "电脑仓", value: "pc" },
];
const data = ref<any|null>(null);
const loading = ref(false);

const activeType = ref<string>("OUT");
const typeOptions = computed(() => {
  if (reportMode.value === "pc") {
    return [
      { label: "出库", value: "OUT" },
      { label: "入库", value: "IN" },
      { label: "归还", value: "RETURN" },
      { label: "回收", value: "RECYCLE" },
      { label: "报废", value: "SCRAP" },
    ];
  }
  return [
    { label: "出库", value: "OUT" },
    { label: "入库", value: "IN" },
  ];
});

const activeTypeLabel = computed(() => ({ OUT:'出库', IN:'入库', RETURN:'归还', RECYCLE:'回收', SCRAP:'报废' } as Record<string,string>)[activeType.value] || activeType.value);

function pickByType(prefix: string, t: string) {
  const key = `${prefix}_${String(t || '').toLowerCase()}`;
  return data.value?.[key] || [];
}

const topTable = computed(() => {
  if (!data.value) return [];
  return pickByType('top', activeType.value);
});

const categoryTable = computed(() => {
  if (!data.value) return [];
  return pickByType('category', activeType.value);
});

const categoryTitle = computed(() => {
  if (reportMode.value !== 'pc') return `按分类${activeTypeLabel.value}`;
  if (activeType.value === 'OUT') return '按部门出库';
  if (activeType.value === 'IN') return '按品牌入库';
  if (activeType.value === 'RETURN') return '按部门归还';
  if (activeType.value === 'RECYCLE') return '按部门回收';
  if (activeType.value === 'SCRAP') return '按报废原因';
  return '分类';
});

async function refresh(){
  loading.value = true;
  try{
    const r:any = await apiGet(`/api/reports/summary?warehouse_id=${warehouseId.value}&days=${days.value}&mode=${reportMode.value}`);
    data.value = r;
  }catch(e:any){
    ElMessage.error(e.message || "加载报表失败");
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

watch(reportMode, () => {
  const allowed = typeOptions.value.map((x:any) => x.value);
  if (!allowed.includes(activeType.value)) activeType.value = 'OUT';
  refresh();
});

onMounted(async ()=>{
  await refresh();
});
</script>
