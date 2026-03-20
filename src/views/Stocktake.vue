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
                  @click="openApplyPreview"
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

            <ul class="preview-list" aria-label="盘点概览">
              <li v-for="item in stocktakeSummaryItems" :key="item.key" class="preview-list-item" :class="item.className">
                <span class="preview-list-label">{{ item.label }}</span>
                <strong class="preview-list-value">{{ item.value }}</strong>
              </li>
            </ul>

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
              <el-button size="small" @click="exportStocktakeReport">导出结果报表</el-button>
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

    <el-dialog v-model="applyPreviewVisible" width="860px" :title="detail?.stocktake?.status === 'APPLYING' ? '继续应用盘点' : '应用盘点前预览'">
      <div class="apply-preview-wrap">
        <el-alert
          v-if="detail?.stocktake?.status === 'APPLYING'"
          type="warning"
          :closable="false"
          show-icon
          title="当前盘点单处于 APPLYING 状态"
          description="说明上次应用可能中断。继续应用时只会补齐未完成的调整记录，不会重复生成已存在的数据。"
        />
        <ul class="preview-list preview-list--dialog" aria-label="应用盘点概览">
          <li v-for="item in stocktakeSummaryItems" :key="`dialog-${item.key}`" class="preview-list-item" :class="item.className">
            <span class="preview-list-label">{{ item.label }}</span>
            <strong class="preview-list-value">{{ item.value }}</strong>
          </li>
        </ul>

        <div class="apply-preview-head">
          <div class="panel-title">将受影响的明细</div>
          <div class="muted">最多预览 20 条差异/未盘项目，确认后系统会生成 ADJUST 调整流水。</div>
        </div>

        <el-table :data="applyPreviewRows" max-height="360" border size="small">
          <el-table-column prop="sku" label="SKU" min-width="150" />
          <el-table-column prop="name" label="名称" min-width="180" />
          <el-table-column prop="system_qty" label="系统数量" width="100" />
          <el-table-column prop="counted_qty" label="盘点数量" width="100" />
          <el-table-column label="差异结果" min-width="140">
            <template #default="{ row }">
              <el-tag v-if="row.diffType === 'pending'" type="info" effect="plain">未盘</el-tag>
              <el-tag v-else-if="row.diffType === 'increase'" type="success">盘盈 {{ row.diff_qty }}</el-tag>
              <el-tag v-else-if="row.diffType === 'decrease'" type="danger">盘亏 {{ row.diff_qty }}</el-tag>
              <el-tag v-else type="info">无差异</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <el-button @click="applyPreviewVisible = false">取消</el-button>
        <el-button type="success" :loading="applying" @click="confirmApplyStocktake">确认应用</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { exportToXlsx, loadXlsx } from "../utils/excel";
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
const applyPreviewVisible = ref(false);

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

const stocktakeSummaryItems = computed(() => ([
  { key: 'total', label: '盘点明细', value: stocktakePreview.value.total, className: '' },
  { key: 'counted', label: '已录入', value: stocktakePreview.value.counted, className: '' },
  { key: 'changed', label: '存在差异', value: stocktakePreview.value.changed, className: 'preview-list-item--changed' },
  { key: 'increase', label: '盘盈', value: stocktakePreview.value.increase, className: 'preview-list-item--increase' },
  { key: 'decrease', label: '盘亏', value: stocktakePreview.value.decrease, className: 'preview-list-item--decrease' },
]));

const applyPreviewRows = computed(() => {
  const lines = detail.value?.lines || [];
  return lines
    .map((line: any) => {
      const counted = !(line.counted_qty === null || line.counted_qty === undefined || line.counted_qty === '');
      const diff = Number(line.diff_qty || 0);
      const diffType = !counted ? 'pending' : diff > 0 ? 'increase' : diff < 0 ? 'decrease' : 'same';
      return { ...line, diffType };
    })
    .filter((line: any) => line.diffType !== 'same')
    .slice(0, 20);
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


async function exportStocktakeReport(){
  if (!detail.value) return ElMessage.warning('请先选择盘点单');
  const summaryRows = [
    ['盘点单号', detail.value.stocktake?.st_no || ''],
    ['仓库', detail.value.stocktake?.warehouse_name || ''],
    ['状态', detail.value.stocktake?.status || ''],
    ['盘点明细', stocktakePreview.value.total],
    ['已录入', stocktakePreview.value.counted],
    ['存在差异', stocktakePreview.value.changed],
    ['盘盈', stocktakePreview.value.increase],
    ['盘亏', stocktakePreview.value.decrease],
    ['导出时间', formatBeijingDateTime(new Date().toISOString())],
  ];
  const detailRows = filteredLines.value.map((row:any) => ({
    SKU: row.sku,
    名称: row.name,
    系统数量: row.system_qty,
    盘点数量: row.counted_qty === null || row.counted_qty === undefined || row.counted_qty === '' ? '未盘' : row.counted_qty,
    差异类型: row.counted_qty === null || row.counted_qty === undefined || row.counted_qty === '' ? '未盘' : Number(row.diff_qty || 0) > 0 ? '盘盈' : Number(row.diff_qty || 0) < 0 ? '盘亏' : '无差异',
    差异数量: row.diff_qty ?? '',
    更新时间: formatBeijingDateTime(row.updated_at),
  }));
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.aoa_to_sheet([['指标','值'], ...summaryRows]);
  const wsDetail = XLSX.utils.json_to_sheet(detailRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, '汇总');
  XLSX.utils.book_append_sheet(wb, wsDetail, '明细');
  XLSX.writeFile(wb, `盘点结果报表_${detail.value.stocktake?.st_no || detail.value.stocktake?.id}.xlsx`);
  ElMessage.success('盘点结果报表已导出');
}

function exportFilteredLines(){
  if (!detail.value || !filteredLines.value.length) return ElMessage.warning('当前没有可导出的盘点明细');
  const filterLabel = { all: '全部', changed: '差异', increase: '盘盈', decrease: '盘亏', pending: '未盘' }[lineFilter.value] || '全部';
  exportToXlsx({
    filename: `盘点明细_${detail.value.stocktake?.st_no || detail.value.stocktake?.id}_${filterLabel}.xlsx`,
    sheetName: '盘点明细',
    headers: [
      { key: 'sku', title: 'SKU' },
      { key: 'name', title: '名称' },
      { key: 'system_qty', title: '系统数量' },
      { key: 'counted_qty_text', title: '盘点数量' },
      { key: 'diff_type', title: '差异类型' },
      { key: 'diff_qty', title: '差异数量' },
      { key: 'updated_at_text', title: '更新时间' },
    ],
    rows: filteredLines.value.map((row:any) => ({
      ...row,
      counted_qty_text: row.counted_qty === null || row.counted_qty === undefined || row.counted_qty === '' ? '未盘' : row.counted_qty,
      diff_type: row.counted_qty === null || row.counted_qty === undefined || row.counted_qty === '' ? '未盘' : Number(row.diff_qty || 0) > 0 ? '盘盈' : Number(row.diff_qty || 0) < 0 ? '盘亏' : '无差异',
      updated_at_text: formatBeijingDateTime(row.updated_at),
    })),
  });
  ElMessage.success('盘点明细已导出');
}

async function downloadCountTemplate(){
  if (!detail.value) return;
  const header = ["sku","counted_qty"];
  // 模板默认带一行示例（sku 留空，导入时会被自动忽略），并列出本次盘点涉及的 SKU
  const exampleRow = ["", 10];
  const rows = detail.value.lines.map((l:any)=>[l.sku,""]);
  const XLSX = await loadXlsx();
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
      const XLSX = await loadXlsx();
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

function openApplyPreview() {
  if (!detail.value) return;
  applyPreviewVisible.value = true;
}

async function confirmApplyStocktake(){
  if (!detail.value) return;
  applying.value = true;
  try{
    const preview:any = await apiPost("/api/stocktake/apply", { id: detail.value.stocktake.id, preview_only: true });
    const info = preview?.data || {};
    await ElMessageBox.confirm(`将应用盘点单 ${info.st_no || detail.value.stocktake.st_no}。预检结果：已录入 ${info.counted_rows || 0} 行，其中需调整 ${info.adjusted_rows || 0} 行，盘盈 ${info.increase_rows || 0} 行，盘亏 ${info.decrease_rows || 0} 行。确认继续？`, '应用盘点预检', { type: 'warning', confirmButtonText: '确认应用', cancelButtonText: '取消' });
    const r:any = await apiPost("/api/stocktake/apply", { id: detail.value.stocktake.id });
    ElMessage.success(`已应用：生成 ${r.adjusted} 条调整记录`);
    applyPreviewVisible.value = false;
    await refreshDetail();
  }catch(e:any){
    if (e === 'cancel' || e === 'close') return;
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
.preview-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;list-style:none;padding:0;margin:0 0 12px}
.preview-list--dialog{margin:0}
.preview-list-item{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 14px;border:1px solid var(--el-border-color-light);border-radius:12px;background:linear-gradient(180deg,#fff 0%,#fafcff 100%)}
.preview-list-item--changed{border-color:#f3d19e;background:#fff9f0}
.preview-list-item--increase{border-color:#b3e19d;background:#f0fdf4}
.preview-list-item--decrease{border-color:#f5c2c7;background:#fef2f2}
.preview-list-label{font-size:13px;color:var(--el-text-color-secondary)}
.preview-list-value{font-size:22px;line-height:1;font-weight:800;color:var(--el-text-color-primary)}
.detail-tools{ display:flex; align-items:center; gap:10px; margin:10px 0; }
.row-selected td{ background: var(--el-color-primary-light-9) !important; }
.apply-preview-wrap{display:flex;flex-direction:column;gap:14px}
.apply-preview-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
.detail-row-pending td{background:#f8fafc !important}
.detail-row-increase td{background:#f0fdf4 !important}
.detail-row-decrease td{background:#fef2f2 !important}
@media (max-width: 768px){
  .stocktake-page{padding:12px}
  .page-header,.panel-header,.detail-header,.detail-tools{flex-direction:column;align-items:stretch}
  .actions,.panel-tools,.detail-actions{width:100%;justify-content:stretch}
  .actions .el-button,.panel-tools .el-button,.detail-actions .el-button{width:100%}
}
</style>