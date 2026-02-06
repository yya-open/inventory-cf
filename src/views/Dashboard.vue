<template>
  <div style="padding:16px">
    <el-card>
      <template #header>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-weight:700">报表与看板</div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <el-select v-model="warehouseId" style="width:180px" placeholder="选择仓库" @change="refresh">
              <el-option v-for="w in warehouses" :key="w.id" :label="w.name" :value="w.id" />
            </el-select>
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

      <div v-if="data" style="display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:12px; margin-bottom:12px;">
        <el-card shadow="never"><div style="color:#999;font-size:12px;">入库数量</div><div style="font-size:26px;font-weight:700;">{{ data.summary.in_qty }}</div></el-card>
        <el-card shadow="never"><div style="color:#999;font-size:12px;">出库数量</div><div style="font-size:26px;font-weight:700;">{{ data.summary.out_qty }}</div></el-card>
        <el-card shadow="never"><div style="color:#999;font-size:12px;">调整数量</div><div style="font-size:26px;font-weight:700;">{{ data.summary.adjust_qty }}</div></el-card>
        <el-card shadow="never"><div style="color:#999;font-size:12px;">明细笔数</div><div style="font-size:26px;font-weight:700;">{{ data.summary.tx_count }}</div></el-card>
      </div>

      <div v-if="data" style="display:grid; grid-template-columns: 1.1fr 0.9fr; gap:12px;">
        <el-card shadow="never">
          <template #header><b>近 {{ days }} 天出库趋势</b> <span style="color:#999;font-size:12px;">（{{ data.range.from }} ~ {{ data.range.to }}）</span></template>
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
          <template #header><b>出库 Top 10</b></template>
          <el-table :data="data.top_out" size="small" border height="360">
            <el-table-column prop="sku" label="SKU" width="120"/>
            <el-table-column prop="name" label="名称" min-width="140"/>
            <el-table-column prop="qty" label="数量" width="80"/>
          </el-table>

          <div style="margin-top:10px;">
            <b>按分类出库</b>
            <el-table :data="data.category_out" size="small" border height="240" style="margin-top:8px;">
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
import { ref, computed, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { apiGet } from "../api/client";

const warehouses = ref<any[]>([]);
const warehouseId = ref(1);
const days = ref(30);
const data = ref<any|null>(null);
const loading = ref(false);

async function loadWarehouses(){
  try{
    const r:any = await apiGet("/api/warehouses");
    warehouses.value = r.data || [];
    if (warehouses.value?.length) warehouseId.value = warehouses.value[0].id;
  }catch(e:any){
    ElMessage.error(e.message || "加载仓库失败");
  }
}

async function refresh(){
  loading.value = true;
  try{
    const r:any = await apiGet(`/api/reports/summary?warehouse_id=${warehouseId.value}&days=${days.value}`);
    data.value = r;
  }catch(e:any){
    ElMessage.error(e.message || "加载报表失败");
  }finally{
    loading.value = false;
  }
}

const seriesFilled = computed(()=>{
  if (!data.value) return [];
  // fill missing days with 0
  const map = new Map<string, number>();
  for (const r of data.value.daily_out || []) map.set(r.day, Number(r.qty));
  const out: any[] = [];
  const to = new Date(data.value.range.to);
  const from = new Date(data.value.range.from);
  for (let d = new Date(from); d <= to; d.setDate(d.getDate()+1)){
    const day = d.toISOString().slice(0,10);
    out.push({ day, qty: map.get(day) ?? 0 });
  }
  return out;
});

function barWidth(qty:number){
  const max = Math.max(...seriesFilled.value.map(x=>x.qty), 1);
  const pct = Math.round((qty / max) * 100);
  return `${pct}%`;
}

onMounted(async ()=>{
  await loadWarehouses();
  await refresh();
});
</script>
