<template>
  <div>
    <el-card shadow="never" class="ui-page-card" style="margin-bottom: 12px">
      <div class="ui-toolbar">
        <div class="ui-toolbar-main">
          <div class="ui-toolbar-block">
            <div class="ui-toolbar-title">筛选查询</div>
            <div class="ui-toolbar-row">
              <el-select v-model="action" placeholder="动作" clearable class="ui-toolbar-select" @change="onSearch">
                <el-option label="在位(OK)" value="OK" />
                <el-option label="异常(ISSUE)" value="ISSUE" />
              </el-select>

              <el-select v-model="issueType" placeholder="异常类型" clearable class="ui-toolbar-select-wide" @change="onSearch">
                <el-option label="找不到显示器" value="NOT_FOUND" />
                <el-option label="位置不符" value="WRONG_LOCATION" />
                <el-option label="二维码不符" value="WRONG_QR" />
                <el-option label="台账状态不符" value="WRONG_STATUS" />
                <el-option label="设备缺失" value="MISSING" />
                <el-option label="其他原因" value="OTHER" />
              </el-select>

              <el-input v-model="keyword" placeholder="关键词（资产编号/SN/品牌/型号/员工/备注…）" clearable class="ui-toolbar-input" @keyup.enter="onSearch" />

              <el-date-picker
                v-model="dateRange"
                type="daterange"
                range-separator="-"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                value-format="YYYY-MM-DD"
                class="ui-toolbar-date"
                @change="onSearch"
              />

              <div class="ui-toolbar-actions">
                <el-button type="primary" @click="onSearch">查询</el-button>
                <el-button @click="reset">重置</el-button>
              </div>
            </div>
          </div>
        </div>

        <div class="ui-toolbar-side">
          <div class="ui-toolbar-block">
            <div class="ui-toolbar-title">快捷工具</div>
            <div class="ui-toolbar-tool-grid">
              <el-button :disabled="loading" @click="exportCsv">导出</el-button>
              <el-button v-if="isAdmin" type="danger" plain :disabled="loading" @click="deleteSelected">删除选中</el-button>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <el-card shadow="never">
      <el-table
        :data="rows"
        v-loading="loading"
        border
        style="width: 100%"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="45" />
        <el-table-column prop="created_at" label="时间" width="170" />

        <el-table-column label="结果" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.action === 'OK'" type="success">在位</el-tag>
            <el-tag v-else type="danger">异常</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="异常类型" width="140">
          <template #default="{ row }">
            {{ issueTypeText(String(row.issue_type || '')) }}
          </template>
        </el-table-column>

        <el-table-column prop="asset_code" label="资产编号" width="130" show-overflow-tooltip />
        <el-table-column prop="sn" label="SN" width="150" show-overflow-tooltip />

        <el-table-column label="显示器" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.brand }} {{ row.model }} <span v-if="row.size_inch">/ {{ row.size_inch }}</span>
          </template>
        </el-table-column>

        <el-table-column label="台账状态" width="110">
          <template #default="{ row }">
            {{ statusText(String(row.status || '')) }}
          </template>
        </el-table-column>

        <el-table-column prop="location_name" label="位置" width="160" show-overflow-tooltip />

        <el-table-column label="领用信息" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.employee_no || row.employee_name || row.department">
              {{ row.employee_no || '-' }} / {{ row.employee_name || '-' }} / {{ row.department || '-' }}
            </span>
            <span v-else>-</span>
          </template>
        </el-table-column>

        <el-table-column prop="remark" label="备注" min-width="240" show-overflow-tooltip />

        <el-table-column v-if="isAdmin" label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button type="danger" link @click="deleteOne(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="display:flex; justify-content: space-between; align-items:center; margin-top: 12px">
        <div style="color:#666">共 {{ total }} 条</div>
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          :page-sizes="[20, 50, 100, 200]"
          @current-change="onPageChange"
          @size-change="onPageSizeChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { apiDownload, apiGet, apiPost } from "../api/client";
import { can } from "../store/auth";

function statusText(s: string) {
  if (s === "IN_STOCK") return "在库";
  if (s === "ASSIGNED") return "已领用";
  if (s === "RECYCLED") return "已回收";
  if (s === "SCRAPPED") return "已报废";
  return s || "-";
}

function issueTypeText(s: string) {
  if (s === "NOT_FOUND") return "找不到显示器";
  if (s === "WRONG_LOCATION") return "位置不符";
  if (s === "WRONG_QR") return "二维码不符";
  if (s === "WRONG_STATUS") return "台账状态不符";
  if (s === "MISSING") return "设备缺失";
  if (s === "OTHER") return "其他原因";
  return s || "-";
}

const action = ref<string>("");
const issueType = ref<string>("");
const keyword = ref<string>("");
const dateRange = ref<[string, string] | null>(null);

const loading = ref(false);
const rows = ref<any[]>([]);

const page = ref(1);
const pageSize = ref(50);
const total = ref(0);

const selectedRows = ref<any[]>([]);
const isAdmin = computed(() => can("admin"));

const totalCache = new Map<string, number>();
let totalTimer: any = null;

function filterKey() {
  return [action.value || "", issueType.value || "", keyword.value || "", dateRange.value?.[0] || "", dateRange.value?.[1] || ""].join("|");
}

function buildParams(withPage: boolean) {
  const params = new URLSearchParams();
  if (action.value) params.set("action", action.value);
  if (issueType.value) params.set("issue_type", issueType.value);
  if (keyword.value) params.set("keyword", keyword.value.trim());
  if (dateRange.value?.[0]) params.set("date_from", dateRange.value[0]);
  if (dateRange.value?.[1]) params.set("date_to", dateRange.value[1]);
  if (withPage) {
    params.set("page", String(page.value));
    params.set("page_size", String(pageSize.value));
  }
  return params;
}

function onSearch() {
  page.value = 1;
  load();
}

function reset() {
  action.value = "";
  issueType.value = "";
  keyword.value = "";
  dateRange.value = null;
  page.value = 1;
  load();
}

async function load() {
  loading.value = true;
  try {
    const params = buildParams(true);
    params.set("fast", "1");
    const r: any = await apiGet(`/api/monitor-inventory-log/list?${params.toString()}`);
    rows.value = r.data || [];

    const key = filterKey();
    if (totalCache.has(key)) {
      total.value = Number(totalCache.get(key) || 0);
      return;
    }

    if (r.total === null || typeof r.total === "undefined") {
      if (totalTimer) clearTimeout(totalTimer);
      totalTimer = setTimeout(() => {
        const p2 = buildParams(false);
        apiGet(`/api/monitor-inventory-log-count?${p2.toString()}`)
          .then((j: any) => {
            const v = Number(j.total || 0);
            totalCache.set(filterKey(), v);
            total.value = v;
          })
          .catch(() => {});
      }, 250);
    } else {
      const v = Number(r.total || 0);
      totalCache.set(key, v);
      total.value = v;
    }
  } catch (e: any) {
    ElMessage.error(e?.message || "加载失败");
  } finally {
    loading.value = false;
  }
}

function onPageChange() {
  load();
}
function onPageSizeChange() {
  page.value = 1;
  load();
}

function onSelectionChange(list: any[]) {
  selectedRows.value = list || [];
}

function buildIds(list: any[]) {
  return (list || [])
    .map((r: any) => Number(r.id))
    .filter((n: number) => Number.isFinite(n) && n > 0);
}

async function deleteSelected() {
  if (!isAdmin.value) return;
  const ids = buildIds(selectedRows.value);
  if (!ids.length) return ElMessage.warning("请先勾选要删除的记录");
  try {
    await ElMessageBox.prompt(`请输入「删除」确认操作（将删除选中的 ${ids.length} 条记录）`, "删除确认", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      inputPlaceholder: "删除",
      inputValidator: (v: string) => (String(v || "").trim() === "删除" ? true : "需要输入「删除」"),
    });
    loading.value = true;
    const r: any = await apiPost("/api/monitor-inventory-log/delete", { ids, confirm: "删除" });
    ElMessage.success(`已删除 ${Number(r?.data?.deleted || 0)} 条记录`);
    selectedRows.value = [];
    totalCache.clear();
    await load();
  } catch (e: any) {
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e?.message || "删除失败");
  } finally {
    loading.value = false;
  }
}

async function deleteOne(row: any) {
  if (!isAdmin.value) return;
  const id = Number(row?.id || 0);
  if (!id) return;
  try {
    await ElMessageBox.prompt(`请输入「删除」确认操作（将删除该条记录）`, "删除确认", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      inputPlaceholder: "删除",
      inputValidator: (v: string) => (String(v || "").trim() === "删除" ? true : "需要输入「删除」"),
    });
    loading.value = true;
    const r: any = await apiPost("/api/monitor-inventory-log/delete", { ids: [id], confirm: "删除" });
    ElMessage.success(`已删除 ${Number(r?.data?.deleted || 0)} 条记录`);
    totalCache.clear();
    await load();
  } catch (e: any) {
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e?.message || "删除失败");
  } finally {
    loading.value = false;
  }
}

async function exportCsv() {
  try {
    const params = buildParams(false);
    await apiDownload(`/api/monitor-inventory-log/export?${params.toString()}`);
  } catch (e: any) {
    ElMessage.error(e?.message || "导出失败");
  }
}

onMounted(load);
</script>
