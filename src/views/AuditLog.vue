<template>
  <el-card class="audit-card">
    <template #header>
      <div class="audit-header">
        <div class="title">
          审计日志
        </div>
        <div class="tools">
          <el-button
            type="primary"
            @click="onSearch"
          >
            查询
          </el-button>
          <el-button @click="reset">
            重置
          </el-button>
          <el-button
            type="info"
            plain
            @click="openRetention"
          >
            保留策略
          </el-button>
          <el-button
            v-if="isAdmin"
            type="danger"
            plain
            :disabled="selectedIds.length===0"
            @click="deleteSelected"
          >
            删除选中 ({{ selectedIds.length }})
          </el-button>
        </div>
      </div>

      <el-form
        class="audit-filters"
        :inline="true"
        @submit.prevent
      >
        <el-form-item>
          <el-input
            v-model="keyword"
            placeholder="搜索：用户/动作/实体/ID"
            clearable
            style="width: 240px"
          />
        </el-form-item>
        <el-form-item>
          <el-select
            v-model="action"
            placeholder="动作"
            clearable
            filterable
            style="width: 190px"
            @change="onSearch"
          >
            <el-option
              v-for="opt in actionFilterOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select
            v-model="entity"
            placeholder="实体"
            clearable
            filterable
            style="width: 190px"
            @change="onSearch"
          >
            <el-option
              v-for="opt in entityFilterOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="user"
            placeholder="用户（如 admin）"
            clearable
            style="width: 150px"
          />
        </el-form-item>
        <el-form-item>
          <el-date-picker
            v-model="range"
            type="daterange"
            range-separator="-"
            start-placeholder="开始"
            end-placeholder="结束"
          />
        </el-form-item>
        <el-form-item>
          <el-select
            v-model="sortBy"
            placeholder="排序字段"
            style="width: 140px"
            @change="onSearch"
          >
            <el-option
              label="时间"
              value="created_at"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select
            v-model="sortDir"
            placeholder="方向"
            style="width: 120px"
            @change="onSearch"
          >
            <el-option
              label="倒序"
              value="desc"
            />
            <el-option
              label="正序"
              value="asc"
            />
          </el-select>
        </el-form-item>
      </el-form>
    </template>

    <el-table
      v-loading="loading"
      :data="rows"
      border
      style="width:100%"
      @selection-change="onSelect"
    >
      <el-table-column
        v-if="isAdmin"
        type="selection"
        width="48"
      />
      <el-table-column
        label="#"
        width="80"
      >
        <template #default="{ $index }">
          {{ (page - 1) * pageSize + $index + 1 }}
        </template>
      </el-table-column>
      <el-table-column
        label="时间"
        min-width="170"
      >
        <template #default="{ row }">
          {{ formatTime(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column
        prop="username"
        label="用户"
        width="130"
      />
      <el-table-column
        label="动作"
        min-width="160"
      >
        <template #default="{ row }">
          <el-tag
            :title="row.action"
            :type="tagType(row.action)"
            effect="light"
          >
            {{ actionLabel(row.action) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="实体"
        min-width="180"
      >
        <template #default="{ row }">
          <div class="entity-cell">
            <div class="entity-name">
              {{ row.item_name || row.user_name || entityLabel(row.entity) || "-" }}
            </div>
            <div
              v-if="row.item_name || row.user_name"
              class="entity-meta"
            >
              {{ entityLabel(row.entity) }}
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        width="140"
        fixed="right"
      >
        <template #default="{ row }">
          <el-button
            link
            type="primary"
            @click="openPayload(row)"
          >
            查看
          </el-button>
          <el-popconfirm
            v-if="isAdmin"
            title="确认删除该审计日志？"
            @confirm="deleteOne(row.id)"
          >
            <template #reference>
              <el-button
                link
                type="danger"
              >
                删除
              </el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <div style="display:flex; justify-content:flex-end; margin-top:12px">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        background
        layout="total, sizes, prev, pager, next, jumper"
        :page-sizes="[20, 50, 100, 200]"
        @current-change="onPageChange"
        @size-change="onPageSizeChange"
      />
    </div>

    <el-dialog
      v-model="showPayload"
      title="详情"
      width="760px"
    >
      <div class="payload-toolbar">
        <el-switch
          v-model="prettyMode"
          active-text="格式化"
          inactive-text="原始"
        />
        <el-button
          :disabled="!payloadToCopy"
          @click="copyPayload"
        >
          复制
        </el-button>
      </div>

      <el-scrollbar
        height="420px"
        class="payload-box"
      >
        <pre class="payload-pre">{{ displayPayload }}</pre>
      </el-scrollbar>

      <template #footer>
        <el-button @click="showPayload=false">
          关闭
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showRetention"
      title="审计保留策略"
      width="520px"
    >
      <div style="color:#606266; margin-bottom:10px">
        当前策略：保留近 <b>{{ retentionDays }}</b> 天；上次清理：{{ retentionLast || "-" }}
      </div>
      <el-form label-width="110px">
        <el-form-item label="保留天数">
          <el-input-number
            v-model="retentionDaysEdit"
            :min="1"
            :max="3650"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item label="立即清理">
          <el-switch
            v-model="runCleanup"
            active-text="是"
            inactive-text="否"
          />
        </el-form-item>
        <el-alert
          v-if="runCleanup"
          type="warning"
          show-icon
          :closable="false"
        >
          将删除早于保留天数的审计日志。确认后不可恢复。
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="showRetention=false">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="retentionSaving"
          @click="saveRetention"
        >
          保存
        </el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { apiGet, apiPost } from "../api/client";
import { can } from "../store/auth";
import { ElMessage, ElMessageBox } from "element-plus";
import { formatBeijingDateTime } from "../utils/datetime";


const ACTION_LABEL: Record<string, string> = {
  STOCK_IN: "入库",
  STOCK_OUT: "出库",
  BATCH_IN: "批量入库",
  BATCH_OUT: "批量出库",
  TX_EXPORT: "导出出入库流水",
  TX_CLEAR: "清空出入库明细",

  STOCKTAKE_CREATE: "创建盘点单",
  STOCKTAKE_IMPORT: "导入盘点结果",
  STOCKTAKE_APPLY: "应用盘点",
  STOCKTAKE_ROLLBACK: "回滚盘点",
  STOCKTAKE_DELETE: "删除盘点单",

  ITEM_CREATE: "新增配件",
  ITEM_UPDATE: "修改配件",
  ITEM_DELETE: "删除配件",

  USER_CREATE: "新增用户",
  USER_UPDATE: "修改用户",
  USER_DELETE: "删除用户",
  USER_RESET_PASSWORD: "重置用户密码",

  AUDIT_DELETE: "删除审计日志",

  ADMIN_INIT_SCHEMA: "初始化系统结构",
  ADMIN_BACKUP: "导出备份",
  ADMIN_RESTORE: "恢复备份",
  ADMIN_RESTORE_UPLOAD: "直传恢复备份",
  ADMIN_RESTORE_JOB_CREATE: "创建恢复任务",
  ADMIN_RESTORE_JOB_PAUSE: "暂停恢复任务",
  ADMIN_RESTORE_JOB_CANCELED: "取消恢复任务",
  ADMIN_RESTORE_JOB_SCAN_DONE: "恢复任务扫描完成",
  ADMIN_RESTORE_JOB_SNAPSHOT_SKIPPED: "恢复任务跳过快照",
  ADMIN_RESTORE_JOB_SNAPSHOT_DONE: "恢复任务快照完成",
  ADMIN_RESTORE_JOB_DONE: "恢复任务完成",
  ADMIN_RESTORE_JOB_FAILED: "恢复任务失败",
  ADMIN_RESTORE_JOB_ROLLBACK_CREATE: "创建恢复回滚任务",

  PC_IN: "电脑入库",
  PC_IN_BATCH: "批量电脑入库",
  PC_OUT: "电脑出库",
  PC_OUT_BATCH: "批量电脑出库",
  PC_RETURN: "电脑归还",
  PC_RETURN_BATCH: "批量电脑归还",
  PC_RECYCLE: "电脑回收",
  PC_RECYCLE_BATCH: "批量电脑回收",
  PC_SCRAP: "电脑报废",
  PC_ASSET_UPDATE: "修改电脑台账",
  PC_ASSET_DELETE: "删除电脑台账",
  PC_TX_DELETE: "删除电脑事务",
  PC_TX_CLEAR: "清空电脑事务",
  PC_LOCATION_CREATE: "新增电脑位置",
  PC_LOCATION_UPDATE: "修改电脑位置",
  PC_LOCATION_DELETE: "删除电脑位置",
  PC_INVENTORY_LOG_DELETE: "删除电脑盘点记录",
  PC_INVENTORY_LOG_EXPORT: "导出电脑盘点记录",

  MONITOR_SCHEMA_INIT: "初始化显示器模块",
  MONITOR_ASSET_CREATE: "新增显示器台账",
  MONITOR_ASSET_UPDATE: "修改显示器台账",
  MONITOR_ASSET_DELETE: "删除显示器台账",
  MONITOR_IN: "显示器入库",
  MONITOR_OUT: "显示器出库",
  MONITOR_RETURN: "显示器归还",
  MONITOR_TRANSFER: "显示器调拨",
  MONITOR_SCRAP: "显示器报废",
  MONITOR_TX_DELETE: "删除显示器事务",
  MONITOR_TX_EXPORT: "导出显示器事务",
  MONITOR_INVENTORY_LOG_DELETE: "删除显示器盘点记录",
  MONITOR_INVENTORY_LOG_EXPORT: "导出显示器盘点记录",

  pc_asset_update: "修改电脑台账",
  pc_asset_delete: "删除电脑台账",
  pc_tx_delete: "删除电脑事务",
  pc_tx_clear: "清空电脑事务",
  monitor_asset_create: "新增显示器台账",
  monitor_asset_update: "修改显示器台账",
  monitor_asset_delete: "删除显示器台账",
};

const ENTITY_LABEL: Record<string, string> = {
  stock_tx: "出入库流水",
  stocktake: "盘点单",
  items: "配件",
  users: "用户",
  audit_log: "审计日志",
  stock: "库存",
  warehouse: "仓库",
  warehouses: "仓库",
  backup: "备份",
  restore_job: "恢复任务",
  schema: "系统结构",
  pc_assets: "电脑台账",
  pc_in: "电脑入库记录",
  pc_out: "电脑出库记录",
  pc_recycle: "电脑回收记录",
  pc_scrap: "电脑报废记录",
  pc_tx: "电脑事务",
  pc_tx_detail: "电脑事务明细",
  pc_locations: "电脑位置",
  pc_inventory_log: "电脑盘点记录",
  monitor_assets: "显示器台账",
  monitor_tx: "显示器事务",
  monitor_inventory_log: "显示器盘点记录",
};

function prettifyCodeLabel(value: string) {
  return String(value || "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function actionLabel(a: string) {
  return ACTION_LABEL[a] || prettifyCodeLabel(a) || "-";
}
function entityLabel(e: string) {
  return ENTITY_LABEL[e] || prettifyCodeLabel(e) || "-";
}


function formatTime(s?: string) {
  return s ? formatBeijingDateTime(s) : "-";
}
const rows = ref<any[]>([]);
const loading = ref(false);

const keyword = ref("");
const sortBy = ref<string>("created_at");
const sortDir = ref<string>("desc");
const action = ref("");
const entity = ref("");
const user = ref("");
const range = ref<any>(null);

const page = ref(1);
const pageSize = ref(50);
const total = ref(0);

const showPayload = ref(false);
const rawPayload = ref("");
const prettyPayload = ref("");
const prettyMode = ref(true);

const actionFilterOptions = computed(() => {
  const keys = Object.keys(ACTION_LABEL);
  return keys
    .sort((a, b) => actionLabel(a).localeCompare(actionLabel(b), "zh-CN"))
    .map((k) => ({ value: k, label: actionLabel(k) }));
});

const entityFilterOptions = computed(() => {
  const keys = Object.keys(ENTITY_LABEL);
  return keys
    .sort((a, b) => entityLabel(a).localeCompare(entityLabel(b), "zh-CN"))
    .map((k) => ({ value: k, label: entityLabel(k) }));
});

const displayPayload = computed(() => {
  if (!prettyMode.value) return rawPayload.value || "";
  return prettyPayload.value || rawPayload.value || "";
});
const payloadToCopy = computed(() => displayPayload.value || "");

// retention policy
const showRetention = ref(false);
const retentionDays = ref(180);
const retentionLast = ref<string | null>(null);
const retentionDaysEdit = ref(180);
const runCleanup = ref(false);
const retentionSaving = ref(false);

async function loadRetention() {
  try {
    const r = await apiGet<{ ok: boolean; data: { retention_days: number; last_cleanup_at: string | null } }>(
      "/api/admin/audit/retention"
    );
    retentionDays.value = Number((r as any).data?.retention_days || 180);
    retentionLast.value = (r as any).data?.last_cleanup_at || null;
    retentionDaysEdit.value = retentionDays.value;
  } catch {
    // ignore (non-admins etc.)
  }
}

async function openRetention() {
  runCleanup.value = false;
  await loadRetention();
  showRetention.value = true;
}

async function saveRetention() {
  try {
    retentionSaving.value = true;
    const payload: any = { retention_days: Number(retentionDaysEdit.value || 180) };
    if (runCleanup.value) {
      const { value } = await ElMessageBox.prompt(
        "将删除早于保留天数的审计日志，输入“清理”确认：",
        "确认立即清理",
        { confirmButtonText: "确认", cancelButtonText: "取消", inputPlaceholder: "请输入：清理", inputValue: "" }
      );
      payload.run_cleanup = true;
      payload.confirm = value;
    }
    const r = await apiPost<any>("/api/admin/audit/retention", payload);
    ElMessage.success(runCleanup.value ? "已保存并清理" : "已保存");
    retentionDays.value = Number((r as any).data?.retention_days || payload.retention_days || 180);
    retentionLast.value = (r as any).data?.last_cleanup_at || retentionLast.value || null;
    runCleanup.value = false;
    showRetention.value = false;
  } catch (e: any) {
    if (e === "cancel" || e?.message === "cancel") return;
    ElMessage.error(e?.message || "保存失败");
  } finally {
    retentionSaving.value = false;
  }
}


const selectedIds = ref<number[]>([]);
const isAdmin = computed(() => can("admin"));

function onSelect(list: any[]) {
  selectedIds.value = (list || []).map(r => Number(r.id)).filter(n => Number.isFinite(n));
}

function tagType(action: string) {
  const a = String(action || "").toUpperCase();
  if (a.includes("DELETE") || a.includes("CLEAR")) return "danger";
  if (a.includes("ROLLBACK") || a.includes("DISABLE") || a.includes("RESET")) return "warning";
  if (a.includes("STOCK_OUT") || a.includes("OUT")) return "warning";
  if (a.includes("STOCK_IN") || a.includes("IN")) return "success";
  return "info";
}

function onSearch(){
  page.value = 1;
  load();
}
function onPageChange(){ load(); }
function onPageSizeChange(){ page.value = 1; load(); }

function reset(){
  keyword.value = "";
  action.value = "";
  entity.value = "";
  user.value = "";
  range.value = null;
  sortBy.value = "created_at";
  sortDir.value = "desc";
  page.value = 1;
  load();
}

function tryPrettyJson(text: string){
  const t = String(text || "").trim();
  if (!t) return "";
  // Only pretty-print if it's valid JSON
  try{
    const obj = JSON.parse(t);
    return JSON.stringify(obj, null, 2);
  }catch{
    return "";
  }
}

function openPayload(row:any){
  rawPayload.value = String(row?.payload_json || "");
  prettyPayload.value = tryPrettyJson(rawPayload.value);
  prettyMode.value = true;
  showPayload.value = true;
}

async function copyPayload(){
  const txt = payloadToCopy.value;
  if (!txt) return;
  try{
    await navigator.clipboard.writeText(txt);
    ElMessage.success("已复制");
  }catch{
    // fallback for older browsers / permissions
    const ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    ta.setAttribute("readonly", "true");
    document.body.appendChild(ta);
    ta.select();
    try{
      document.execCommand("copy");
      ElMessage.success("已复制");
    }catch{
      ElMessage.error("复制失败");
    }finally{
      document.body.removeChild(ta);
    }
  }
}

async function load(){
  loading.value = true;
  try{
    const params = new URLSearchParams();
    if (keyword.value) params.set("keyword", keyword.value);
    if (action.value) params.set("action", action.value);
    if (entity.value) params.set("entity", entity.value);
    if (user.value) params.set("user", user.value);
    if (range.value?.length === 2){
      // ElementPlus gives Date objects
      const s = new Date(range.value[0]);
      const e = new Date(range.value[1]);
      params.set("date_from", s.toISOString().slice(0,10));
      params.set("date_to", e.toISOString().slice(0,10));
    }
    params.set("page", String(page.value));
    params.set("page_size", String(pageSize.value));
    if (sortBy.value) params.set("sort_by", sortBy.value);
    if (sortDir.value) params.set("sort_dir", sortDir.value);

    const j:any = await apiGet(`/api/audit/list?${params.toString()}`);
    rows.value = (j.data || []).map((r:any, idx:number)=>({ ...r }));
    total.value = Number(j.total || 0);
  }catch(e:any){
    ElMessage.error(e.message || "加载失败");
  }finally{
    loading.value = false;
  }
}

async function hardConfirm(expected: string, title: string) {
  const { value } = await ElMessageBox.prompt(
    `请输入「${expected}」确认操作（区分大小写）`,
    title,
    {
      type: "warning",
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      inputPlaceholder: expected,
      inputValidator: (v: string) => (String(v || "").trim() === expected ? true : `需要输入「${expected}」`),
    }
  );
  return String(value || "").trim();
}

async function deleteOne(id: number){
  try{
    await hardConfirm("删除", "二次确认");
    await apiPost(`/api/audit/delete`, { id, confirm: "删除" });
    ElMessage.success("已删除");
    // if delete makes current page empty, go back one page.
    if (rows.value.length === 1 && page.value > 1) page.value -= 1;
    await load();
  }catch(e:any){
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e.message || "删除失败");
  }
}

async function deleteSelected(){
  const ids = selectedIds.value.slice();
  if (!ids.length) return;
  try{
    await ElMessageBox.confirm(`确认删除选中的 ${ids.length} 条审计日志？`, "删除确认", { type: "warning" });
    await hardConfirm("删除", "二次确认");
    await apiPost(`/api/audit/delete`, { ids, confirm: "删除" });
    ElMessage.success("已删除");
    selectedIds.value = [];
    // adjust page if needed
    if (rows.value.length <= ids.length && page.value > 1) page.value -= 1;
    await load();
  }catch(e:any){
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e.message || "删除失败");
  }
}

onMounted(load);
</script>

<style scoped>
.audit-header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.title{font-weight:800;font-size:16px}
.tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.audit-filters{margin-top:10px}
.entity-cell{display:flex;flex-direction:column;gap:2px;line-height:1.15}
.entity-name{font-weight:600}
.entity-meta{font-size:12px;color:#909399}
.payload-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.payload-box{border:1px solid var(--el-border-color);border-radius:10px}
.payload-pre{margin:0;padding:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-size:12px;line-height:1.45;white-space:pre-wrap;word-break:break-word}

</style>
