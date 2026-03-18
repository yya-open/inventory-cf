<template>
  <div class="stocktake-page">
    <el-card class="stocktake-card">
      <template #header>
        <div class="page-header">
          <div class="title">
            库存盘点
          </div>
          <div class="actions">
            <el-button
              type="primary"
              :loading="creating"
              @click="createStocktake"
            >
              新建盘点单
            </el-button>
          </div>
        </div>
      </template>

      <div class="body">
        <!-- Left: list -->
        <div class="panel left">
          <div class="panel-header">
            <div class="panel-title">
              盘点单列表
            </div>
            <div class="panel-tools">
              <el-input
                v-model="listKeyword"
                size="small"
                clearable
                placeholder="搜索 ID / 单号 / 状态"
                style="width: 190px;"
              />
              <el-select
                v-model="listSortBy"
                size="small"
                style="width: 120px"
                @change="onListSortChange"
              >
                <el-option
                  label="创建时间"
                  value="created_at"
                />
                <el-option
                  label="状态"
                  value="status"
                />
                <el-option
                  label="单号"
                  value="st_no"
                />
              </el-select>
              <el-select
                v-model="listSortDir"
                size="small"
                style="width: 95px"
                @change="onListSortChange"
              >
                <el-option
                  label="升序"
                  value="asc"
                />
                <el-option
                  label="降序"
                  value="desc"
                />
              </el-select>
              <el-button
                size="small"
                @click="loadList"
              >
                刷新
              </el-button>
              <el-button
                size="small"
                @click="toggleList"
              >
                {{ listCollapsed ? "展开" : "收起" }}
              </el-button>
            </div>
          </div>

          <el-table
            ref="listTableRef"
            :data="list"
            :height="listTableHeight"
            border
            highlight-current-row
            :row-class-name="rowClassName"
            @row-click="openStocktake"
          >
            <!-- 显示序号（避免删除导致 ID 断号带来的困惑），真实 id 仍保留在 row.id 供接口使用 -->
            <el-table-column
              label="序号"
              width="70"
            >
              <template #default="scope">
                {{ (listPage-1)*listPageSize + scope.$index + 1 }}
              </template>
            </el-table-column>
            <el-table-column
              label="盘点单号"
              min-width="190"
            >
              <template #default="{ row }">
                <span class="mono">{{ row.st_no }}</span>
                <span
                  class="muted"
                  style="margin-left:6px;"
                >#{{ row.id }}</span>
              </template>
            </el-table-column>
            <el-table-column
              label="状态"
              width="110"
            >
              <template #default="{ row }">
                <el-tag
                  :type="row.status==='DRAFT' ? 'info' : ((row.status==='APPLYING' || row.status==='ROLLING') ? 'warning' : 'success')"
                  size="small"
                >
                  {{ row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column
              label="创建时间"
              min-width="170"
            >
              <template #default="{ row }">
                {{ formatBeijingDateTime(row.created_at) }}
              </template>
            </el-table-column>
            <el-table-column
              label="操作"
              width="90"
              fixed="right"
            >
              <template #default="{ row }">
                <template v-if="row.status==='DRAFT'">
                  <el-button
                    v-if="isAdmin"
                    type="danger"
                    link
                    @click.stop="deleteStocktake(row)"
                  >
                    删除
                  </el-button>
                </template>
                <template v-else-if="row.status==='APPLIED'">
                  <el-button
                    type="warning"
                    link
                    @click.stop="rollbackStocktakeByRow(row)"
                  >
                    撤销
                  </el-button>
                </template>
                <template v-else>
                  <span class="muted">-</span>
                </template>
              </template>
            </el-table-column>
          </el-table>

          <div style="display:flex; justify-content:flex-end; margin-top:10px">
            <el-pagination
              v-model:current-page="listPage"
              v-model:page-size="listPageSize"
              :total="listTotal"
              background
              layout="total, sizes, prev, pager, next"
              :page-sizes="[20, 50, 100, 200]"
              @current-change="onListPageChange"
              @size-change="onListPageSizeChange"
            />
          </div>
        </div>

        <!-- Right: detail -->
        <div class="panel right">
          <div
            v-if="!detail"
            class="empty"
          >
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
                  <el-tag
                    :type="detail.stocktake.status==='DRAFT' ? 'info' : ((detail.stocktake.status==='APPLYING' || detail.stocktake.status==='ROLLING') ? 'warning' : 'success')"
                    size="small"
                  >
                    {{ detail.stocktake.status }}
                  </el-tag>
                  <span class="muted">创建：{{ formatBeijingDateTime(detail.stocktake.created_at) }}</span>
                </div>
              </div>

              <div class="detail-actions">
                <el-button @click="downloadCountTemplate">
                  下载盘点模板
                </el-button>
                <el-upload
                  :show-file-list="false"
                  accept=".xlsx,.xls"
                  :before-upload="beforeUpload"
                  :disabled="detail.stocktake.status!=='DRAFT'"
                >
                  <el-button :disabled="detail.stocktake.status!=='DRAFT'">
                    导入盘点结果
                  </el-button>
                </el-upload>
                <el-button
                  type="primary"
                  :loading="saving"
                  :disabled="detail.stocktake.status!=='DRAFT'"
                  @click="saveLines"
                >
                  保存
                </el-button>
                <el-button
                  type="success"
                  :loading="applying"
                  :disabled="!['DRAFT','APPLYING'].includes(detail.stocktake.status)"
                  @click="applyStocktake"
                >
                  {{ detail.stocktake.status==='APPLYING' ? '继续应用' : '应用盘点' }}
                </el-button>
                <el-button
                  v-if="['APPLIED','ROLLING'].includes(detail.stocktake.status)"
                  type="warning"
                  plain
                  :loading="rolling"
                  @click="rollbackStocktake"
                >
                  {{ detail.stocktake.status==='ROLLING' ? '继续撤销' : '撤销盘点' }}
                </el-button>
                <el-button
                  v-if="isAdmin"
                  type="danger"
                  plain
                  :disabled="detail.stocktake.status!=='DRAFT'"
                  @click="deleteStocktake(detail.stocktake)"
                >
                  删除盘点单
                </el-button>
              </div>
            </div>

            <div class="preview-cards">
              <div class="preview-card">
                <div class="preview-label">盘点明细</div>
                <div class="preview-value">{{ stocktakePreview.total }}</div>
              </div>
              <div class="preview-card">
                <div class="preview-label">已录入</div>
                <div class="preview-value">{{ stocktakePreview.counted }}</div>
              </div>
              <div class="preview-card preview-card--changed">
                <div class="preview-label">存在差异</div>
                <div class="preview-value">{{ stocktakePreview.changed }}</div>
              </div>
              <div class="preview-card preview-card--increase">
                <div class="preview-label">盘盈</div>
                <div class="preview-value">{{ stocktakePreview.increase }}</div>
              </div>
              <div class="preview-card preview-card--decrease">
                <div class="preview-label">盘亏</div>
                <div class="preview-value">{{ stocktakePreview.decrease }}</div>
              </div>
            </div>

            <div class="detail-tools">
              <el-input
                v-model="lineKeyword"
                clearable
                placeholder="搜索 SKU / 名称"
                style="max-width: 260px;"
              />
              <el-segmented
                v-model="lineFilter"
                :options="lineFilterOptions"
                size="small"
              />
              <div
                class="muted"
                style="margin-left:auto;"
              >
                共 {{ filteredLines.length }} 条明细
              </div>
            </div>

            <el-table
              :data="filteredLines"
              height="520"
              stripe
              size="small"
              border
              :row-class-name="detailRowClassName"
            >
              <el-table-column
                prop="sku"
                label="SKU"
                width="160"
              />
              <el-table-column
                prop="name"
                label="名称"
                min-width="180"
              />
              <el-table-column
                prop="system_qty"
                label="系统数量"
                width="110"
              />
              <el-table-column
                label="盘点数量"
                width="130"
              >
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
              <el-table-column
                prop="diff_qty"
                label="差异"
                width="110"
              >
                <template #default="{ row }">
                  <el-tag v-if="row.counted_qty===null || row.counted_qty===undefined || row.counted_qty===''" size="small" type="info" effect="plain">未盘</el-tag>
                  <el-tag v-else-if="Number(row.diff_qty || 0) > 0" size="small" type="success">+{{ Number(row.diff_qty || 0) }}</el-tag>
                  <el-tag v-else-if="Number(row.diff_qty || 0) < 0" size="small" type="danger">{{ Number(row.diff_qty || 0) }}</el-tag>
                  <el-tag v-else size="small" type="info">0</el-tag>
                </template>
              </el-table-column>
              <el-table-column
                label="更新时间"
                width="170"
              >
                <template #default="{ row }">
                  {{ formatBeijingDateTime(row.updated_at) }}
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import * as XLSX from "xlsx";
import { formatBeijingDateTime } from "../utils/datetime";
import { apiGet, apiPost } from "../api/client";
import { useFixedWarehouseId } from "../utils/warehouse";
import { can } from "../store/auth";

const warehouseId = ref(1);
const isAdmin = computed(() => can("admin"));

const list = ref<any[]>([]);
const listPage = ref(1);
const listPageSize = ref(50);
const listTotal = ref(0);
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
const lineFilter = ref<'all'|'changed'|'increase'|'decrease'|'pending'>("all");
const lineFilterOptions = [
  { label: '全部', value: 'all' },
  { label: '差异', value: 'changed' },
  { label: '盘盈', value: 'increase' },
  { label: '盘亏', value: 'decrease' },
  { label: '未盘', value: 'pending' },
];
const listKeyword = ref("");
const listSortBy = ref<string>("created_at");
const listSortDir = ref<string>("desc");

const creating = ref(false);
const applying = ref(false);
const rolling = ref(false);
const saving = ref(false);

const dirty = ref<Set<number>>(new Set());

const filteredLines = computed(()=>{
  if (!detail.value) return [];
  const k = lineKeyword.value.trim().toLowerCase();
  return detail.value.lines.filter((x:any)=>{
    const hitKeyword = !k || String(x.sku||"").toLowerCase().includes(k) || String(x.name||"").toLowerCase().includes(k);
    if (!hitKeyword) return false;
    const diff = Number(x.diff_qty || 0);
    const counted = !(x.counted_qty === null || x.counted_qty === undefined || x.counted_qty === '');
    if (lineFilter.value === 'changed') return counted && diff !== 0;
    if (lineFilter.value === 'increase') return counted && diff > 0;
    if (lineFilter.value === 'decrease') return counted && diff < 0;
    if (lineFilter.value === 'pending') return !counted;
    return true;
  });
});

const stocktakePreview = computed(() => {
  const lines = detail.value?.lines || [];
  const counted = lines.filter((line:any) => line.counted_qty !== null && line.counted_qty !== undefined && line.counted_qty !== '');
  const changed = counted.filter((line:any) => Number(line.diff_qty || 0) !== 0);
  return {
    total: lines.length,
    counted: counted.length,
    changed: changed.length,
    increase: changed.filter((line:any) => Number(line.diff_qty || 0) > 0).length,
    decrease: changed.filter((line:any) => Number(line.diff_qty || 0) < 0).length,
  };
});



function rowClassName({ row }: any){
  return Number(row?.id) === Number(selectedId.value) ? "row-selected" : "";
}

function detailRowClassName({ row }: any) {
  if (row.counted_qty === null || row.counted_qty === undefined || row.counted_qty === '') return 'detail-row-pending';
  const diff = Number(row.diff_qty || 0);
  if (diff > 0) return 'detail-row-increase';
  if (diff < 0) return 'detail-row-decrease';
  return '';
}

function scrollToSelected(){
  if (!selectedId.value) return;
  const idx = list.value.findIndex((x:any)=>Number(x.id)===Number(selectedId.value));
  if (idx < 0) return;
  const el = listTableRef.value?.$el as HTMLElement | undefined;
  const body = el?.querySelector?.(".el-table__body-wrapper") as HTMLElement | null;
  const trs = body?.querySelectorAll?.("tbody tr") as NodeListOf<HTMLElement> | undefined;
  const tr = trs?.[idx];
  tr?.scrollIntoView({ block: "center" });
}

watch(list, async () => {
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



watch(warehouseId, async ()=>{
  selectedId.value = null;
  detail.value = null;
  listPage.value = 1;
  await loadList();
});

let _kwTimer: any = null;
watch(listKeyword, () => {
  if (_kwTimer) clearTimeout(_kwTimer);
  _kwTimer = setTimeout(() => {
    listPage.value = 1;
    loadList();
  }, 300);
});

function onListPageChange(){
  loadList();
}

function onListPageSizeChange(){
  listPage.value = 1;
  loadList();
}

function onListSortChange(){
  listPage.value = 1;
  loadList();
}

async function loadList(){
  try{
    const params = new URLSearchParams();
    params.set('warehouse_id', String(warehouseId.value));
    params.set('page', String(listPage.value));
    params.set('page_size', String(listPageSize.value));
    if (listKeyword.value.trim()) params.set('keyword', listKeyword.value.trim());
    if (listSortBy.value) params.set('sort_by', listSortBy.value);
    if (listSortDir.value) params.set('sort_dir', listSortDir.value);
    const r:any = await apiGet(`/api/stocktake/list?${params.toString()}`);
    listTotal.value = Number(r.total || 0);
    list.value = r.data || [];
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
	    selectedId.value = Number(r.id);
	    await loadDetail(Number(r.id));
	    await nextTick();
	    scrollToSelected();
  }catch(e:any){
    ElMessage.error(e.message || "创建失败");
  }finally{
    creating.value = false;
  }
}

function downloadCountTemplate(){
  if (!detail.value) return;
  const header = ["sku","counted_qty"];
  // 模板默认带一行示例（sku 留空，导入时会被自动忽略），并列出本次盘点涉及的 SKU
  const exampleRow = ["", 10];
  const rows = detail.value.lines.map((l:any)=>[l.sku,""]);
  const ws = XLSX.utils.aoa_to_sheet([header, exampleRow, ...rows]);
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
      const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" }) as any[][];

      const headerRow = (aoa?.[0] || []).map((x) => String(x ?? "").trim());
      const norm = (v: any) => String(v ?? "").trim().toLowerCase();
      const headerNorm = headerRow.map(norm);

      const findCol = (aliases: string[]) => {
        const aliasNorm = aliases.map(norm);
        const idx = headerNorm.findIndex((h) => aliasNorm.includes(h));
        return idx >= 0 ? idx : null;
      };

      const colSku = findCol(["sku", "SKU", "配件", "物料", "物料编码"]);
      const colCount = findCol(["counted_qty", "盘点数量", "数量", "qty"]);

      const missing: string[] = [];
      if (colSku === null) missing.push("sku");
      if (colCount === null) missing.push("counted_qty");
      if (missing.length) {
        ElMessageBox.alert(
          `表头缺少必需列：${missing.join("、")}。

请使用模板表头：sku, counted_qty（也支持：盘点数量/数量）`,
          "导入失败",
          { type: "error" }
        );
        return;
      }

      const errors: Array<{ row: number; col: string; msg: string; val?: any }> = [];
      const lines: Array<{ sku: string; counted_qty: number }> = [];

      for (let i = 1; i < aoa.length; i++) {
        const r = aoa[i] || [];
        const sku = String(r[colSku!] ?? "").trim();
        const raw = r[colCount!];
        const rawStr = String(raw ?? "").trim();

        const anyFilled = !!sku || rawStr !== "";
        if (!anyFilled) continue;

        if (!sku && rawStr !== "") {
          errors.push({ row: i + 1, col: "sku", msg: "SKU/配件为空", val: sku });
          continue;
        }

        // Blank counted_qty means "ignore this row" (do not overwrite)
        if (!rawStr) continue;

        const n = Number(rawStr);
        if (Number.isNaN(n)) {
          errors.push({ row: i + 1, col: "counted_qty", msg: "盘点数量格式不对（应为数字）", val: rawStr });
          continue;
        }

        lines.push({ sku, counted_qty: n });
      }

      if (!lines.length) {
        if (errors.length) {
          const preview = errors
            .slice(0, 12)
            .map((x) => `第${x.row}行【${x.col}】${x.msg}${x.val !== undefined ? `（当前：${String(x.val)}）` : ""}`)
            .join("<br/>");
          ElMessageBox.alert(
            `<div style="line-height:1.8">没有可导入的有效行。发现 <b>${errors.length}</b> 处问题：<br/>${preview}${
              errors.length > 12 ? "<br/>…（仅展示前 12 条）" : ""
            }</div>`,
            "导入提示",
            { type: "warning", dangerouslyUseHTMLString: true }
          );
        } else {
          ElMessage.warning("没有读取到有效数据（请确认第一行是表头，且至少有一行盘点数量）");
        }
        return;
      }

      const r:any = await apiPost("/api/stocktake/import", { id: detail.value.stocktake.id, lines });
      ElMessage.success(`导入完成：更新 ${r.updated} 行`);
      if (r.unknown?.length) ElMessage.warning(`有 ${r.unknown.length} 个 SKU 未识别（已跳过）`);

      if (errors.length) {
        const preview = errors.slice(0, 8).map((x) => `第${x.row}行【${x.col}】${x.msg}`).join("；");
        ElMessage.warning(errors.length > 8 ? `${preview}…（共${errors.length}处，已跳过）` : `${preview}（已跳过）`);
      }

      await refreshDetail();
    }catch(err:any){
      ElMessage.error(err.message || "导入失败");
    }
  };
  reader.readAsArrayBuffer(file);
  return false;
}

	// 保存按钮回调（模板里绑定的是 saveLines）
	async function saveLines(){
	  if (!detail.value) return;
	  if (!dirty.value.size){
	    ElMessage.info("没有需要保存的修改");
	    return;
	  }
  saving.value = true;
  try{
    const lines = detail.value.lines
      .filter((l:any)=>dirty.value.has(l.id))
      .map((l:any)=>{
        const raw = l.counted_qty;
        const isEmpty = raw === null || raw === undefined || raw === "";
        return {
          sku: l.sku,
          // When user clears the input, explicitly send null so backend clears counted_qty/diff_qty.
          counted_qty: isEmpty ? null : Number(raw),
        };
      })
      .filter((x:any)=>x.sku && (x.counted_qty === null || !Number.isNaN(x.counted_qty)));
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
  const stStatus = String(detail.value.stocktake.status || "");
  const preview = stocktakePreview.value;
  const confirmMsg = stStatus === "APPLYING"
    ? "检测到盘点单处于 APPLYING（上次应用可能中断）。点击“继续”将尝试补齐未完成的调整记录（幂等，不会重复生成已写入的调整流水）。"
    : `
      <div style="line-height:1.8">
        <div>即将应用盘点结果，系统会按差异生成 <b>ADJUST</b> 调整流水并更新库存。</div>
        <div style="margin-top:8px">本次预览：</div>
        <ul style="margin:6px 0 0 18px; padding:0">
          <li>盘点明细：<b>${preview.total}</b> 条</li>
          <li>已录入盘点数量：<b>${preview.counted}</b> 条</li>
          <li>存在差异：<b>${preview.changed}</b> 条</li>
          <li>盘盈：<b>${preview.increase}</b> 条</li>
          <li>盘亏：<b>${preview.decrease}</b> 条</li>
        </ul>
      </div>`;

  try{
    await ElMessageBox.confirm(confirmMsg, stStatus === "APPLYING" ? "继续应用" : "确认应用盘点", { type: "warning", dangerouslyUseHTMLString: stStatus !== 'APPLYING', confirmButtonText: stStatus === 'APPLYING' ? '继续应用' : '确认应用', cancelButtonText: '取消' });
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

async function rollbackStocktake(){
  if (!detail.value) return;
  const stStatus = String(detail.value.stocktake.status || "");
  if (!['APPLIED','ROLLING'].includes(stStatus)) return;
  try{
    await ElMessageBox.confirm(
      stStatus === 'ROLLING'
        ? "盘点单正处于撤销中（上次撤销可能中断）。点击“继续”将尝试补齐未完成的撤销流水与库存恢复（幂等，不会重复写入已存在的撤销流水）。"
        : "撤销后将把库存恢复为盘点前的系统数量，并生成撤销流水（REVERSAL）。确认继续？",
      stStatus === 'ROLLING' ? "继续撤销盘点" : "确认撤销盘点",
      { type: "warning", confirmButtonText: "撤销", cancelButtonText: "取消" }
    );
  }catch{ return; }

  rolling.value = true;
  try{
    const r:any = await apiPost("/api/stocktake/rollback", { id: detail.value.stocktake.id });
    ElMessage.success(`撤销成功：恢复 ${r.reversed} 条差异库存`);
    await loadList();
    await refreshDetail();
  }catch(e:any){
    ElMessage.error(e.message || "撤销失败");
  }finally{
    rolling.value = false;
  }
}

async function rollbackStocktakeByRow(row:any){
  if (!row?.id) return;
  // 若当前未打开或打开的不是该行，则先打开确保右侧展示一致
  if (Number(selectedId.value) !== Number(row.id)) {
    selectedId.value = Number(row.id);
    await loadDetail(Number(row.id));
  }
  await rollbackStocktake();
}

onMounted(async ()=>{
  await loadList();
});
</script>


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