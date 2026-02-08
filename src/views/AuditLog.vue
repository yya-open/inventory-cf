<template>
  <el-card class="audit-card">
    <template #header>
      <div class="audit-header">
        <div class="title">审计日志</div>
        <div class="tools">
          <el-button type="primary" @click="onSearch">查询</el-button>
          <el-button @click="reset">重置</el-button>
          <el-button type="danger" plain :disabled="selectedIds.length===0" @click="deleteSelected">
            删除选中 ({{ selectedIds.length }})
          </el-button>
        </div>
      </div>

      <el-form class="audit-filters" :inline="true" @submit.prevent>
        <el-form-item>
          <el-input v-model="keyword" placeholder="搜索：用户/动作/实体/ID" clearable style="width: 240px" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="action" placeholder="动作（如 STOCK_OUT）" clearable style="width: 170px" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="entity" placeholder="实体（如 stock_tx）" clearable style="width: 150px" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="user" placeholder="用户（如 admin）" clearable style="width: 150px" />
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
      </el-form>
    </template>

    <el-table
      :data="rows"
      v-loading="loading"
      border
      style="width:100%"
      @selection-change="onSelect"
    >
      <el-table-column type="selection" width="48" />
      <el-table-column label="#" width="80">
        <template #default="{ $index }">
          {{ (page - 1) * pageSize + $index + 1 }}
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="时间" min-width="170" />
      <el-table-column prop="username" label="用户" width="130" />
      <el-table-column label="动作" min-width="160">
        <template #default="{ row }">
          <el-tag :title="row.action" :type="tagType(row.action)" effect="light">{{ actionLabel(row.action) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="实体" min-width="180">
        <template #default="{ row }">
          <div class="entity-cell">
            <div class="entity-name">{{ row.item_name || row.user_name || entityLabel(row.entity) || "-" }}</div>
            <div class="entity-meta" v-if="row.item_name || row.user_name">{{ entityLabel(row.entity) }}</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="entity_id" label="实体ID" min-width="140" />
      <el-table-column label="IP" width="180">
        <template #default="{ row }">
          <span class="ip">{{ row.ip || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openPayload(row)">查看</el-button>
          <el-popconfirm title="确认删除该审计日志？" @confirm="deleteOne(row.id)">
            <template #reference>
              <el-button link type="danger">删除</el-button>
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

    <el-dialog v-model="showPayload" title="详情" width="760px">
      <div class="payload-toolbar">
        <el-switch v-model="prettyMode" active-text="格式化" inactive-text="原始" />
        <el-button @click="copyPayload" :disabled="!payloadToCopy">复制</el-button>
      </div>

      <el-scrollbar height="420px" class="payload-box">
        <pre class="payload-pre">{{ displayPayload }}</pre>
      </el-scrollbar>

      <template #footer>
        <el-button @click="showPayload=false">关闭</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { apiGet, apiPost } from "../api/client";
import { ElMessage, ElMessageBox } from "element-plus";


const ACTION_LABEL: Record<string, string> = {
  STOCK_IN: "入库",
  STOCK_OUT: "出库",
  BATCH_IN: "批量入库",
  BATCH_OUT: "批量出库",
  STOCKTAKE_APPLY: "盘点生效",
  STOCKTAKE_ROLLBACK: "撤销盘点",
  STOCKTAKE_DELETE: "删除盘点单",
  ITEM_CREATE: "新增配件",
  ITEM_UPDATE: "修改配件",
  ITEM_DELETE: "删除配件",
  USER_CREATE: "新增用户",
  USER_UPDATE: "修改用户",
  USER_DELETE: "删除用户",
  USER_RESET_PASSWORD: "重置密码",
  TX_CLEAR: "清空出入库明细",
  AUDIT_DELETE: "删除审计日志",
  ADMIN_BACKUP: "导出备份",
  ADMIN_RESTORE_UPLOAD: "恢复备份（直导）",
  ADMIN_RESTORE_JOB_CREATE: "恢复备份-创建任务",
  ADMIN_RESTORE_JOB_SCAN_DONE: "恢复备份-扫描完成",
  ADMIN_RESTORE_JOB_DONE: "恢复备份-完成",
  ADMIN_RESTORE_JOB_CANCEL: "恢复备份-取消/暂停",
};

const ENTITY_LABEL: Record<string, string> = {
  stock_tx: "出入库流水",
  stocktake: "盘点单",
  items: "配件",
  users: "用户",
  audit_log: "审计日志",
  stock: "库存",
  warehouse: "仓库",
  backup: "备份",
  restore_job: "恢复任务",
};

function actionLabel(a: string) {
  return ACTION_LABEL[a] || a;
}
function entityLabel(e: string) {
  return ENTITY_LABEL[e] || e;
}

const rows = ref<any[]>([]);
const loading = ref(false);

const keyword = ref("");
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

const displayPayload = computed(() => {
  if (!prettyMode.value) return rawPayload.value || "";
  return prettyPayload.value || rawPayload.value || "";
});
const payloadToCopy = computed(() => displayPayload.value || "");


const selectedIds = ref<number[]>([]);

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

    const j:any = await apiGet(`/api/audit/list?${params.toString()}`);
    rows.value = (j.data || []).map((r:any, idx:number)=>({ ...r }));
    total.value = Number(j.total || 0);
  }catch(e:any){
    ElMessage.error(e.message || "加载失败");
  }finally{
    loading.value = false;
  }
}

async function deleteOne(id: number){
  try{
    await apiPost(`/api/audit/delete`, { id });
    ElMessage.success("已删除");
    // if delete makes current page empty, go back one page.
    if (rows.value.length === 1 && page.value > 1) page.value -= 1;
    await load();
  }catch(e:any){
    ElMessage.error(e.message || "删除失败");
  }
}

async function deleteSelected(){
  const ids = selectedIds.value.slice();
  if (!ids.length) return;
  try{
    await ElMessageBox.confirm(`确认删除选中的 ${ids.length} 条审计日志？`, "删除确认", { type: "warning" });
    await apiPost(`/api/audit/delete`, { ids });
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
.ip{word-break:break-all}
.payload-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.payload-box{border:1px solid var(--el-border-color);border-radius:10px}
.payload-pre{margin:0;padding:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-size:12px;line-height:1.45;white-space:pre-wrap;word-break:break-word}

</style>
