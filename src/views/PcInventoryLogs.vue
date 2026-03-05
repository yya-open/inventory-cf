<template>
  <div>
    <el-card shadow="never" style="margin-bottom: 12px">
      <div style="display:flex; flex-wrap: wrap; gap: 10px; align-items: center">
        <el-select v-model="action" placeholder="动作" style="width: 130px" clearable @change="onSearch">
          <el-option label="在位(OK)" value="OK" />
          <el-option label="异常(ISSUE)" value="ISSUE" />
        </el-select>

        <el-select v-model="issueType" placeholder="异常类型" style="width: 170px" clearable @change="onSearch">
          <el-option label="未找到" value="NOT_FOUND" />
          <el-option label="位置不对" value="WRONG_LOCATION" />
          <el-option label="二维码不对" value="WRONG_QR" />
          <el-option label="状态不对" value="WRONG_STATUS" />
          <el-option label="缺失" value="MISSING" />
          <el-option label="其他" value="OTHER" />
        </el-select>

        <el-input v-model="keyword" placeholder="关键词（SN/品牌/型号/员工/备注…）" style="width: 320px" clearable @keyup.enter="onSearch" />

        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="-"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          @change="onSearch"
        />

        <el-button type="primary" @click="onSearch">查询</el-button>
        <el-button @click="reset">重置</el-button>

        <div style="flex: 1"></div>

        <el-button :disabled="loading" @click="exportCsv">导出</el-button>
        <el-button v-if="isAdmin" type="danger" plain :disabled="loading" @click="deleteSelected">删除选中</el-button>
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

        <el-table-column prop="issue_type" label="异常类型" width="140" />
        <el-table-column prop="serial_no" label="SN" width="150" show-overflow-tooltip />
        <el-table-column label="电脑" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.brand }} {{ row.model }}
          </template>
        </el-table-column>
        <el-table-column label="台账状态" width="110">
          <template #default="{ row }">
            {{ statusText(String(row.status || '')) }}
          </template>
        </el-table-column>

        <el-table-column label="领用信息" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.last_employee_no || row.last_employee_name || row.last_department">
              {{ row.last_employee_no || '-' }} / {{ row.last_employee_name || '-' }} / {{ row.last_department || '-' }}
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
    // PERF: 首屏优先拿数据，total 异步补齐（与 pc-assets / pc-tx 的优化保持一致）
    params.set("fast", "1");
    const r: any = await apiGet(`/api/pc-inventory-log/list?${params.toString()}`);
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
        apiGet(`/api/pc-inventory-log-count?${p2.toString()}`)
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
    const r: any = await apiPost("/api/pc-inventory-log/delete", { ids, confirm: "删除" });
    ElMessage.success(`已删除 ${Number(r?.data?.deleted || 0)} 条记录`);
    selectedRows.value = [];
    // 删除会影响 total，清理缓存
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
    await ElMessageBox.prompt(`请输入「删除」确认操作（将删除该条盘点记录，SN: ${row?.serial_no || '-'}）`, "删除确认", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      inputPlaceholder: "删除",
      inputValidator: (v: string) => (String(v || "").trim() === "删除" ? true : "需要输入「删除」"),
    });
    loading.value = true;
    const r: any = await apiPost("/api/pc-inventory-log/delete", { ids: [id], confirm: "删除" });
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
    const p = buildParams(false);
    // 后端自带 max 上限；这里给一个默认最大导出量
    p.set("max", "50000");
    const stamp = new Date();
    const y = stamp.getFullYear();
    const m = String(stamp.getMonth() + 1).padStart(2, "0");
    const d = String(stamp.getDate()).padStart(2, "0");
    await apiDownload(`/api/pc-inventory-log/export?${p.toString()}`, `pc_inventory_log_${y}${m}${d}.csv`);
  } catch (e: any) {
    ElMessage.error(e?.message || "导出失败");
  }
}

onMounted(load);
</script>
