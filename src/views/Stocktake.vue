<template>
  <div class="stocktake-page">
    <el-card class="stocktake-card">
      <template #header>
        <div class="page-header">
          <div class="title">库存盘点</div>
          <div class="actions">
            <el-select v-model="warehouseId" class="wh-select" placeholder="选择仓库">
              <el-option v-for="w in warehouses" :key="w.id" :label="w.name" :value="w.id" />
            </el-select>
            <el-button type="primary" @click="createStocktake" :loading="creating">新建盘点单</el-button>
          </div>
        </div>
      </template>

      <div class="body">
        <!-- Left: list -->
        <div class="panel left">
          <div class="panel-header">
            <div class="panel-title">盘点单列表</div>
            <div class="panel-tools">
              <el-input v-model="listKeyword" size="small" clearable placeholder="搜索 ID / 单号 / 状态" style="width: 190px;" />
              <el-button size="small" @click="loadList">刷新</el-button>
              <el-button size="small" @click="toggleList">{{ listCollapsed ? "展开" : "收起" }}</el-button>
            </div>
          </div>

          <el-table
            ref="listTableRef"
            :data="sortedList"
            :height="listTableHeight"
            border
            highlight-current-row
            :row-class-name="rowClassName"
            @row-click="openStocktake"
          >
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="st_no" label="盘点单号" min-width="170" />
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag :type="row.status==='DRAFT' ? 'info' : 'success'" size="small">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="创建时间" min-width="160" />
            <el-table-column label="操作" width="90" fixed="right">
              <template #default="{ row }">
                <el-button
                  type="danger"
                  link
                  :disabled="row.status!=='DRAFT'"
                  @click.stop="deleteStocktake(row)"
                >删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- Right: detail -->
        <div class="panel right">
          <div v-if="!detail" class="empty">
            <el-empty description="点击左侧盘点单查看明细" />
          </div>

          <div v-else>
            <div class="detail-header">
              <div class="detail-title">
                <div class="main">
                  <span class="mono">{{ detail.stocktake.st_no }}</span>
                  <span class="sep">·</span>
                  <span>{{ detail.stocktake.warehouse_name }}</span>
                </div>
                <div class="sub">
                  <el-tag :type="detail.stocktake.status==='DRAFT' ? 'info' : 'success'" size="small">
                    {{ detail.stocktake.status }}
                  </el-tag>
                  <span class="muted">创建：{{ detail.stocktake.created_at }}</span>
                </div>
              </div>

              <div class="detail-actions">
                <el-button @click="downloadCountTemplate" :disabled="detail.stocktake.status!=='DRAFT'">下载盘点模板</el-button>
                <el-upload
                  :show-file-list="false"
                  accept=".xlsx,.xls"
                  :before-upload="beforeUpload"
                  :disabled="detail.stocktake.status!=='DRAFT'"
                >
                  <el-button :disabled="detail.stocktake.status!=='DRAFT'">导入盘点结果</el-button>
                </el-upload>
                <el-button type="primary" @click="saveLines" :loading="saving" :disabled="detail.stocktake.status!=='DRAFT'">保存</el-button>
                <el-button type="success" @click="applyStocktake" :loading="applying" :disabled="detail.stocktake.status!=='DRAFT'">应用盘点</el-button>
                <el-button type="danger" plain @click="deleteStocktake(detail.stocktake)" :disabled="detail.stocktake.status!=='DRAFT'">删除盘点单</el-button>
              </div>
            </div>

            <div class="detail-tools">
              <el-input v-model="lineKeyword" clearable placeholder="搜索 SKU / 名称" style="max-width: 260px;" />
              <div class="muted" style="margin-left:auto;">
                共 {{ filteredLines.length }} 条明细
              </div>
            </div>

            <el-table :data="filteredLines" height="520" stripe size="small" border>
              <el-table-column prop="sku" label="SKU" width="160" />
              <el-table-column prop="name" label="名称" min-width="180" />
              <el-table-column prop="system_qty" label="系统数量" width="110" />
              <el-table-column label="盘点数量" width="130">
                <template #default="{ row }">
                  <el-input
                    v-model="row.counted_qty"
                    type="number"
                    size="small"
                    :disabled="detail.stocktake.status!=='DRAFT'"
                    @change="markDirty(row)"
                  />
                </template>
              </el-table-column>
              <el-table-column prop="diff_qty" label="差异" width="90" />
              <el-table-column prop="updated_at" label="更新时间" width="170" />
            </el-table>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.stocktake-page{ padding:16px; }
.stocktake-card{ border-radius:12px; }
.page-header{ display:flex; justify-content:space-between; align-items:center; }
.title{ font-weight:800; font-size:16px; }
.actions{ display:flex; gap:10px; align-items:center; }
.wh-select{ width:180px; }
.body{ display:flex; flex-direction:column; gap:16px; }
.panel{ background: var(--el-bg-color); border:1px solid var(--el-border-color-light); border-radius:12px; overflow:hidden; }
.left{ width:100%; }
.right{ width:100%; padding:12px; min-height: 520px; }
.panel-header{ display:flex; justify-content:space-between; align-items:center; padding:12px 12px 8px; }
.panel-title{ font-weight:700; }
.panel-tools{ display:flex; gap:8px; align-items:center; }
.empty{ padding:36px 0; }
.detail-header{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:10px; }
.detail-title .main{ font-weight:800; font-size:14px; }
.detail-title .sub{ display:flex; gap:10px; align-items:center; margin-top:6px; }
.muted{ color: var(--el-text-color-secondary); font-size:12px; }
.sep{ margin:0 6px; color: var(--el-text-color-secondary); }
.mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
.detail-actions{ display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; }
.detail-tools{ display:flex; align-items:center; gap:10px; margin:10px 0; }
.row-selected td{ background: var(--el-color-primary-light-9) !important; }
</style>


<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import * as XLSX from "xlsx";
import { apiGet, apiPost } from "../api/client";

const warehouses = ref<any[]>([]);
const warehouseId = ref(1);

const list = ref<any[]>([]);
const detail = ref<any|null>(null);

// list selection + scroll
const listTableRef = ref<any>(null);
const selectedId = ref<number | null>(null);

const listCollapsed = ref(false);
const listTableHeight = computed(() => (listCollapsed.value ? 220 : 360));
const toggleList = () => {
  listCollapsed.value = !listCollapsed.value;
  // 展开后若有选中项，滚动定位到选中行
  if (!listCollapsed.value) {
    nextTick(() => {
      if (selectedId.value != null) scrollToSelected();
    });
  }
};


const lineKeyword = ref("");
const listKeyword = ref("");
const creating = ref(false);
const applying = ref(false);
const saving = ref(false);

const dirty = ref<Set<number>>(new Set());

const filteredLines = computed(()=>{
  if (!detail.value) return [];
  const k = lineKeyword.value.trim().toLowerCase();
  if (!k) return detail.value.lines;
  return detail.value.lines.filter((x:any)=>
    String(x.sku||"").toLowerCase().includes(k) || String(x.name||"").toLowerCase().includes(k)
  );
});


const filteredList = computed(()=>{
  const k = listKeyword.value.trim().toLowerCase();
  if (!k) return list.value;
  return list.value.filter((x:any)=>{
    return String(x.id||"").includes(k)
      || String(x.st_no||"").toLowerCase().includes(k)
      || String(x.status||"").toLowerCase().includes(k);
  });
});

const sortedList = computed(()=>{
  return (filteredList.value || []).slice().sort((a:any,b:any)=>Number(a.id)-Number(b.id));
});

function rowClassName({ row }: any){
  return Number(row?.id) === Number(selectedId.value) ? "row-selected" : "";
}

function scrollToSelected(){
  if (!selectedId.value) return;
  const idx = sortedList.value.findIndex((x:any)=>Number(x.id)===Number(selectedId.value));
  if (idx < 0) return;
  const el = listTableRef.value?.$el as HTMLElement | undefined;
  const body = el?.querySelector?.(".el-table__body-wrapper") as HTMLElement | null;
  const trs = body?.querySelectorAll?.("tbody tr") as NodeListOf<HTMLElement> | undefined;
  const tr = trs?.[idx];
  tr?.scrollIntoView({ block: "center" });
}

watch(sortedList, async () => {
  await nextTick();
  scrollToSelected();
});

async function deleteStocktake(row:any){
  if (!row?.id) return;
  if (String(row.status) !== "DRAFT"){
    ElMessage.warning("仅草稿状态可删除");
    return;
  }
  try{
    await ElMessageBox.confirm(
      `确认删除盘点单 ${row.st_no || row.id}？此操作不可恢复。`,
      "删除确认",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
    );
  }catch{
    return;
  }
  try{
    await apiPost("/api/stocktake/delete", { id: Number(row.id) });
    ElMessage.success("删除成功");
    if (Number(selectedId.value) === Number(row.id)){
      selectedId.value = null;
      detail.value = null;
    }
    await loadList();
  }catch(e:any){
    ElMessage.error(e.message || "删除失败");
  }
}




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


watch(warehouseId, async ()=>{
  selectedId.value = null;
  detail.value = null;
  await loadList();
});

async function loadList(){
  try{
    const r:any = await apiGet(`/api/stocktake/list?warehouse_id=${warehouseId.value}`);
    list.value = (r.data || []).slice().sort((a:any,b:any)=>Number(a.id)-Number(b.id));
  }catch(e:any){
    ElMessage.error(e.message || "加载盘点单失败");
  }
}

async function openStocktake(row:any){
  if (!row) return;
  selectedId.value = Number(row.id);
  await loadDetail(Number(row.id));
  await nextTick();
  scrollToSelected();
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