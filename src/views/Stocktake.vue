<template>
  <div style="padding:16px">
    <el-card>
      <template #header>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-weight:700">库存盘点</div>
          <div style="display:flex; gap:10px; align-items:center;">
            <el-select v-model="warehouseId" style="width:180px" placeholder="选择仓库">
              <el-option v-for="w in warehouses" :key="w.id" :label="w.name" :value="w.id" />
            </el-select>
            <el-button type="primary" @click="createStocktake" :loading="creating">新建盘点单</el-button>
          </div>
        </div>
      </template>

      <div style="display:flex; gap:16px;">
        <div style="width:360px;">
          <el-table :data="list" height="560" border @row-click="openStocktake">
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="st_no" label="盘点单号" min-width="160" />
            <el-table-column prop="status" label="状态" width="90" />
            <el-table-column prop="created_at" label="创建" min-width="150" />
          </el-table>
        </div>

        <div style="flex:1;">
          <div v-if="!detail" style="color:#999; padding:16px;">点击左侧盘点单查看明细</div>

          <div v-else>
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
              <div>
                <div style="font-weight:700">{{ detail.stocktake.st_no }} · {{ detail.stocktake.warehouse_name }}</div>
                <div style="color:#888; font-size:12px;">状态：{{ detail.stocktake.status }}　创建：{{ detail.stocktake.created_at }}</div>
              </div>
              <div style="display:flex; gap:10px; align-items:center;">
                <el-button @click="downloadCountTemplate" :disabled="detail.stocktake.status!=='DRAFT'">下载盘点模板</el-button>
                <el-upload :show-file-list="false" accept=".xlsx,.xls" :before-upload="beforeUpload" :disabled="detail.stocktake.status!=='DRAFT'">
                  <el-button type="primary" :disabled="detail.stocktake.status!=='DRAFT'">导入盘点结果</el-button>
                </el-upload>
                <el-button type="danger" @click="applyStocktake" :disabled="detail.stocktake.status!=='DRAFT'" :loading="applying">
                  应用差异（生成盘盈盘亏）
                </el-button>
              </div>
            </div>

            <el-input v-model="keyword" placeholder="搜索 SKU/名称" style="width:320px; margin-bottom:10px;" />

            <el-table :data="filteredLines" height="510" border>
              <el-table-column prop="sku" label="SKU" width="160" />
              <el-table-column prop="name" label="名称" min-width="180" />
              <el-table-column prop="category" label="分类" width="140" />
              <el-table-column prop="system_qty" label="系统库存" width="110" />
              <el-table-column label="盘点数量" width="140">
                <template #default="{ row }">
                  <el-input-number v-model="row.counted_qty" :min="0" :disabled="detail.stocktake.status!=='DRAFT'" @change="markDirty(row)" />
                </template>
              </el-table-column>
              <el-table-column prop="diff_qty" label="差异" width="110">
                <template #default="{ row }">
                  <span :style="{ color: row.diff_qty>0 ? '#d4380d' : (row.diff_qty<0 ? '#0958d9' : '#666') }">
                    {{ row.diff_qty ?? '' }}
                  </span>
                </template>
              </el-table-column>
            </el-table>

            <div style="margin-top:10px; display:flex; justify-content:flex-end; gap:10px;">
              <el-button @click="refreshDetail">刷新</el-button>
              <el-button type="primary" @click="saveInline" :disabled="detail.stocktake.status!=='DRAFT' || !dirty.size" :loading="saving">
                保存修改（{{ dirty.size }}）
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import * as XLSX from "xlsx";
import { apiGet, apiPost } from "../api/client";

const warehouses = ref<any[]>([]);
const warehouseId = ref(1);

const list = ref<any[]>([]);
const detail = ref<any|null>(null);
const keyword = ref("");
const creating = ref(false);
const applying = ref(false);
const saving = ref(false);

const dirty = ref<Set<number>>(new Set());

const filteredLines = computed(()=>{
  if (!detail.value) return [];
  const k = keyword.value.trim().toLowerCase();
  if (!k) return detail.value.lines;
  return detail.value.lines.filter((x:any)=>
    String(x.sku||"").toLowerCase().includes(k) || String(x.name||"").toLowerCase().includes(k)
  );
});

function markDirty(row:any){
  if (row.counted_qty===null || row.counted_qty===undefined || row.counted_qty==="") {
    row.diff_qty = null;
  } else {
    row.diff_qty = Number(row.counted_qty) - Number(row.system_qty);
  }
  dirty.value.add(row.id);
}

async function loadWarehouses(){
  try{
    const r:any = await apiGet("/api/warehouses");
    warehouses.value = r.data || [];
    if (warehouses.value?.length) warehouseId.value = warehouses.value[0].id;
  }catch(e:any){
    ElMessage.error(e.message || "加载仓库失败");
  }
}

async function loadList(){
  try{
    const r:any = await apiGet(`/api/stocktake/list?warehouse_id=${warehouseId.value}`);
    list.value = r.data || [];
  }catch(e:any){
    ElMessage.error(e.message || "加载盘点单失败");
  }
}

async function openStocktake(row:any){
  await loadDetail(row.id);
}

async function loadDetail(id:number){
  try{
    const r:any = await apiGet(`/api/stocktake/detail?id=${id}`);
    detail.value = r;
    dirty.value = new Set();
  }catch(e:any){
    ElMessage.error(e.message || "加载盘点明细失败");
  }
}

async function refreshDetail(){
  if (!detail.value) return;
  await loadDetail(detail.value.stocktake.id);
}

async function createStocktake(){
  creating.value = true;
  try{
    const r:any = await apiPost("/api/stocktake/create", { warehouse_id: warehouseId.value });
    ElMessage.success("盘点单已创建");
    await loadList();
    await loadDetail(r.id);
  }catch(e:any){
    ElMessage.error(e.message || "创建失败");
  }finally{
    creating.value = false;
  }
}

function downloadCountTemplate(){
  if (!detail.value) return;
  const header = ["sku","counted_qty"];
  const rows = detail.value.lines.map((l:any)=>[l.sku,""]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "count");
  XLSX.writeFile(wb, `stocktake_${detail.value.stocktake.st_no}.xlsx`);
}

function beforeUpload(file: File){
  const reader = new FileReader();
  reader.onload = async (e) => {
    try{
      if (!detail.value) return;
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });
      const lines = json.map(r=>({
        sku: String(r.sku ?? r.SKU ?? "").trim(),
        counted_qty: Number(r.counted_qty ?? r.qty ?? r["盘点数量"] ?? r["数量"] ?? "")
      })).filter(x=>x.sku && !Number.isNaN(x.counted_qty));
      const r:any = await apiPost("/api/stocktake/import", { id: detail.value.stocktake.id, lines });
      ElMessage.success(`导入完成：更新 ${r.updated} 行`);
      if (r.unknown?.length) ElMessage.warning(`有 ${r.unknown.length} 个 SKU 未识别（已跳过）`);
      await refreshDetail();
    }catch(err:any){
      ElMessage.error(err.message || "导入失败");
    }
  };
  reader.readAsArrayBuffer(file);
  return false;
}

async function saveInline(){
  if (!detail.value || !dirty.value.size) return;
  saving.value = true;
  try{
    const lines = detail.value.lines
      .filter((l:any)=>dirty.value.has(l.id))
      .map((l:any)=>({ sku: l.sku, counted_qty: Number(l.counted_qty) }));
    const r:any = await apiPost("/api/stocktake/import", { id: detail.value.stocktake.id, lines });
    ElMessage.success(`已保存：${r.updated} 行`);
    await refreshDetail();
  }catch(e:any){
    ElMessage.error(e.message || "保存失败");
  }finally{
    saving.value = false;
  }
}

async function applyStocktake(){
  if (!detail.value) return;
  try{
    await ElMessageBox.confirm("将按盘点差异生成盘盈盘亏（ADJUST）并更新库存，且盘点单状态变为已应用，确认继续？", "确认应用", { type: "warning" });
  }catch{ return; }

  applying.value = true;
  try{
    const r:any = await apiPost("/api/stocktake/apply", { id: detail.value.stocktake.id });
    ElMessage.success(`已应用：生成 ${r.adjusted} 条调整记录`);
    await refreshDetail();
  }catch(e:any){
    ElMessage.error(e.message || "应用失败");
  }finally{
    applying.value = false;
  }
}

onMounted(async ()=>{
  await loadWarehouses();
  await loadList();
});
</script>
