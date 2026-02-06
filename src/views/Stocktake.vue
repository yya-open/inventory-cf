<template>
  <div class="page">
    <div class="wrap">
      <el-row :gutter="16">
        <!-- Left: Stocktake list -->
        <el-col :xs="24" :lg="9" :xl="8">
          <el-card class="panel" shadow="never">
            <template #header>
              <div class="panel-header">
                <div class="title">
                  <div class="h">库存盘点</div>
                  <div class="sub">按 ID 升序显示（从 1 开始）</div>
                </div>

                <div class="actions">
                  <el-select v-model="warehouseId" class="w-select" placeholder="选择仓库" @change="loadList">
                    <el-option v-for="w in warehouses" :key="w.id" :label="w.name" :value="w.id" />
                  </el-select>
                  <el-button type="primary" @click="createStocktake" :loading="creating">新建盘点单</el-button>
                </div>
              </div>
            </template>

            <div class="list-tools">
              <el-input v-model="listKeyword" placeholder="搜索：盘点单号 / 状态" clearable />
              <el-button @click="loadList" :loading="loadingList">刷新</el-button>
            </div>

            <el-table
              :data="filteredList"
              v-loading="loadingList"
              height="640"
              stripe
              highlight-current-row
              ref="listTableRef"
              :row-key="(r:any)=>r.id"
              :row-class-name="rowClassName"
              @row-click="openStocktake"
            >
              <el-table-column prop="id" label="ID" width="70" />
              <el-table-column prop="st_no" label="盘点单号" min-width="180" show-overflow-tooltip />
              <el-table-column prop="status" label="状态" width="95">
                <template #default="{ row }">
                  <el-tag :type="row.status==='DRAFT' ? 'warning' : 'success'" effect="light">
                    {{ row.status }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="created_at" label="创建时间" min-width="160" show-overflow-tooltip />
              <el-table-column label="" width="74" align="center" fixed="right">
                <template #default="{ row }">
                  <el-tooltip content="删除盘点单" placement="top" :disabled="row.status!=='DRAFT'">
                    <span>
                      <el-button type="danger" plain size="small" :disabled="row.status!=='DRAFT'" @click.stop="deleteStocktake(row)">删除</el-button>
                    </span>
                  </el-tooltip>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>

        <!-- Right: Detail -->
        <el-col :xs="24" :lg="15" :xl="16">
          <el-card class="panel" shadow="never">
            <template #header>
              <div class="detail-header">
                <div v-if="detail" class="title">
                  <div class="h">
                    {{ detail.stocktake.st_no }}
                    <el-tag class="ml8" :type="detail.stocktake.status==='DRAFT' ? 'warning' : 'success'" effect="light">
                      {{ detail.stocktake.status }}
                    </el-tag>
                  </div>
                  <div class="sub">
                    仓库：{{ detail.stocktake.warehouse_name }}　｜　创建：{{ detail.stocktake.created_at }}
                  </div>
                </div>
                <div v-else class="title">
                  <div class="h">盘点明细</div>
                  <div class="sub">从左侧选择一个盘点单查看</div>
                </div>

                <div class="actions">
                  <template v-if="detail">
                    <el-button @click="downloadCountTemplate" :disabled="detail.stocktake.status!=='DRAFT'">下载模板</el-button>

                    <el-upload
                      :show-file-list="false"
                      accept=".xlsx,.xls"
                      :before-upload="beforeUpload"
                      :disabled="detail.stocktake.status!=='DRAFT'"
                    >
                      <el-button type="primary" :disabled="detail.stocktake.status!=='DRAFT'">导入结果</el-button>
                    </el-upload>

                    <el-button
                      type="danger"
                      @click="applyStocktake"
                      :disabled="detail.stocktake.status!=='DRAFT'"
                      :loading="applying"
                    >
                      应用差异
                    </el-button>

                    <el-dropdown trigger="click">
                      <el-button>
                        更多 ▼
                      </el-button>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item @click="refreshDetail">刷新明细</el-dropdown-item>
                          <el-dropdown-item divided :disabled="detail.stocktake.status!=='DRAFT'" @click="deleteStocktake(detail.stocktake)">
                            删除盘点单
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </template>
                </div>
              </div>
            </template>

            <div v-if="!detail" class="empty">
              <el-empty description="点击左侧盘点单查看明细" />
            </div>

            <div v-else>
              <div class="detail-tools">
                <el-input v-model="keyword" placeholder="搜索：SKU / 名称" clearable />
                <div class="meta">
                  <el-tag effect="plain">明细：{{ detail.lines.length }}</el-tag>
                  <el-tag effect="plain" type="info">已修改：{{ dirty.size }}</el-tag>
                </div>
              </div>

              <el-table
                :data="filteredLines"
                v-loading="loadingDetail"
                height="560"
                stripe
                border
                size="small"
              >
                <el-table-column prop="sku" label="SKU" width="160" />
                <el-table-column prop="name" label="名称" min-width="220" show-overflow-tooltip />
                <el-table-column prop="category" label="分类" width="140" show-overflow-tooltip />
                <el-table-column prop="system_qty" label="系统库存" width="100" />
                <el-table-column label="盘点数量" width="140">
                  <template #default="{ row }">
                    <el-input-number
                      v-model="row.counted_qty"
                      :min="0"
                      :controls="false"
                      :disabled="detail.stocktake.status!=='DRAFT'"
                      @change="markDirty(row)"
                    />
                  </template>
                </el-table-column>
                <el-table-column prop="diff_qty" label="差异" width="90" align="center">
                  <template #default="{ row }">
                    <span :class="row.diff_qty>0 ? 'diff-plus' : (row.diff_qty<0 ? 'diff-minus' : 'diff-zero')">
                      {{ row.diff_qty ?? '' }}
                    </span>
                  </template>
                </el-table-column>
              </el-table>

              <div class="footer">
                <el-button @click="refreshDetail">刷新</el-button>
                <el-button
                  type="primary"
                  @click="saveInline"
                  :disabled="detail.stocktake.status!=='DRAFT' || !dirty.size"
                  :loading="saving"
                >
                  保存修改（{{ dirty.size }}）
                </el-button>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import * as XLSX from "xlsx";
import { apiGet, apiPost } from "../api/client";

const warehouses = ref<any[]>([]);
const warehouseId = ref(1);

// left list selection
const listTableRef = ref<any>(null);
const selectedId = ref<number|null>(null);

const list = ref<any[]>([]);
const listKeyword = ref("");
const loadingList = ref(false);

// selection + scroll
const listTableRef = ref<any>(null);
const selectedId = ref<number | null>(null);

const detail = ref<any|null>(null);
const loadingDetail = ref(false);

const keyword = ref("");
const creating = ref(false);
const applying = ref(false);
const saving = ref(false);

const dirty = ref<Set<number>>(new Set());

const filteredList = computed(()=>{
  const k = listKeyword.value.trim().toLowerCase();
  const sorted = [...(list.value||[])].sort((a,b)=>Number(a.id)-Number(b.id));
  if (!k) return sorted;
  return sorted.filter((x:any)=>
    String(x.st_no||"").toLowerCase().includes(k) ||
    String(x.status||"").toLowerCase().includes(k) ||
    String(x.id||"").includes(k)
  );
});

const filteredLines = computed(()=>{
  if (!detail.value) return [];
  const k = keyword.value.trim().toLowerCase();
  if (!k) return detail.value.lines;
  return detail.value.lines.filter((x:any)=>
    String(x.sku||"").toLowerCase().includes(k) || String(x.name||"").toLowerCase().includes(k)
  );
});

function rowClassName({ row }: { row: any }){
  return selectedId.value === Number(row?.id) ? "row-selected" : "";
}

async function syncSelectionAndScroll(){
  await nextTick();
  const table = listTableRef.value;
  const rows = filteredList.value || [];
  if (!rows.length) return;

  const target = selectedId.value != null
    ? rows.find((r:any)=>Number(r.id)===Number(selectedId.value))
    : null;
  if (!target) return;

  // make element-plus apply current-row class
  try{ table?.setCurrentRow?.(target); }catch{}

  await nextTick();
  // scroll current row into view (nearest)
  const el = table?.$el?.querySelector?.('.el-table__body-wrapper .current-row');
  if (el?.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
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

async function loadList(){
  loadingList.value = true;
  try{
    const r:any = await apiGet(`/api/stocktake/list?warehouse_id=${warehouseId.value}`);
    list.value = (r.data || []).sort((a:any,b:any)=>Number(a.id)-Number(b.id));
    await syncSelectionAndScroll();
  }catch(e:any){
    ElMessage.error(e.message || "加载盘点单失败");
  }finally{
    loadingList.value = false;
  }
}

async function openStocktake(row:any){
  selectedId.value = Number(row.id);
  await loadDetail(row.id);
  await syncSelectionAndScroll();
}

async function loadDetail(id:number){
  loadingDetail.value = true;
  try{
    const r:any = await apiGet(`/api/stocktake/detail?id=${id}`);
    detail.value = r;
    dirty.value = new Set();
    selectedId.value = Number(r?.stocktake?.id ?? id);
  }catch(e:any){
    ElMessage.error(e.message || "加载盘点明细失败");
  }finally{
    loadingDetail.value = false;
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
    selectedId.value = Number(r.id);
    await loadDetail(r.id);
    await syncSelectionAndScroll();
  }catch(e:any){
    ElMessage.error(e.message || "创建失败");
  }finally{
    creating.value = false;
  }
}

async function deleteStocktake(row:any){
  const id = Number(row?.id);
  if (!id) return;

  try{
    await ElMessageBox.confirm(
      `确认删除盘点单 #${id} 吗？删除后不可恢复。`,
      "删除确认",
      { type: "warning", confirmButtonText: "删除", confirmButtonClass: "el-button--danger" }
    );
  }catch{ return; }

  try{
    await apiPost("/api/stocktake/delete", { id });
    ElMessage.success("已删除");
    // if deleting current detail, clear it
    if (detail.value?.stocktake?.id === id) detail.value = null;
    if (selectedId.value === id) selectedId.value = null;
    await loadList();
    await syncSelectionAndScroll();
  }catch(e:any){
    ElMessage.error(e.message || "删除失败");
  }
}

// When filtered list changes (search / reload), keep selection highlighted & scrolled
watch([filteredList, selectedId], async ()=>{
  await syncSelectionAndScroll();
});

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
    await loadList();
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

<style scoped>
.page{ padding:16px; background:#f6f7fb; min-height: calc(100vh - 64px); }
.wrap{ max-width: 1400px; margin: 0 auto; }
.panel{ border-radius: 12px; }
.panel-header{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
.detail-header{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
.title .h{ font-weight:800; font-size:16px; line-height:1.2; }
.title .sub{ color:#8c8c8c; font-size:12px; margin-top:4px; }
.actions{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
.w-select{ width: 180px; }
.list-tools{ display:flex; gap:10px; align-items:center; margin-bottom:12px; }
.detail-tools{ display:flex; justify-content:space-between; gap:12px; align-items:center; margin-bottom:12px; }
.detail-tools .meta{ display:flex; gap:8px; align-items:center; }
.footer{ margin-top: 12px; display:flex; justify-content:flex-end; gap:10px; }
.empty{ padding: 28px 0; }
.ml8{ margin-left: 8px; }
.ml6{ margin-left: 6px; }
.diff-plus{ color:#d4380d; font-weight:600; }
.diff-minus{ color:#0958d9; font-weight:600; }
.diff-zero{ color:#666; }

/* selected row highlight (left list) */
:deep(.el-table .row-selected td){
  background: rgba(64,158,255,0.12);
}
:deep(.el-table .row-selected td:first-child){
  box-shadow: inset 3px 0 0 #409eff;
}
</style>
