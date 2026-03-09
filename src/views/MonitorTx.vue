<template>
  <div>
    <el-card shadow="never" class="ui-page-card mb12">
      <div class="ui-toolbar">
        <div class="ui-toolbar-main">
          <div class="ui-toolbar-block">
            <div class="ui-toolbar-title">筛选查询</div>
            <div class="ui-toolbar-row">
              <el-select v-model="q.type" placeholder="动作" clearable class="ui-toolbar-select" @change="reload()">
                <el-option label="入库" value="IN" />
                <el-option label="出库" value="OUT" />
                <el-option label="归还" value="RETURN" />
                <el-option label="调拨" value="TRANSFER" />
                <el-option label="报废" value="SCRAP" />
                <el-option label="调整" value="ADJUST" />
              </el-select>

              <el-date-picker v-model="q.dates" type="daterange" unlink-panels range-separator="-" start-placeholder="开始" end-placeholder="结束" value-format="YYYY-MM-DD" class="ui-toolbar-date" @change="reload()" />

              <el-input v-model="q.keyword" placeholder="关键词：资产编号/SN/员工/备注" clearable class="ui-toolbar-input" @keyup.enter="reload()" />

              <div class="ui-toolbar-actions">
                <el-button type="primary" @click="reload()">查询</el-button>
              </div>
            </div>
          </div>
        </div>

        <div class="ui-toolbar-side">
          <div class="ui-toolbar-block">
            <div class="ui-toolbar-title">快捷工具</div>
            <div class="ui-toolbar-tool-row">
              <el-button @click="doExport">导出</el-button>
              <el-dropdown v-if="can('admin')" trigger="click" @command="handleMoreCommand">
                <el-button class="ui-toolbar-more-button">更多</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="delete" :disabled="!selected.length">删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <el-card shadow="never">
      <el-table :data="rows" v-loading="loading" size="small" border @selection-change="onSel">
        <el-table-column type="selection" width="44" />
        <el-table-column prop="created_at" label="时间" min-width="170" />
        <el-table-column label="动作" width="100">
          <template #default="{ row }">{{ typeText(row.tx_type) }}</template>
        </el-table-column>
        <el-table-column prop="asset_code" label="资产编号" min-width="160" />
        <el-table-column prop="sn" label="SN" min-width="140" />
        <el-table-column label="型号" min-width="200">
          <template #default="{ row }">{{ [row.brand, row.model].filter(Boolean).join(' ') }}</template>
        </el-table-column>
        <el-table-column prop="size_inch" label="尺寸" width="90" />
        <el-table-column label="位置" min-width="220">
          <template #default="{ row }">
            <div v-if="row.from_location_name || row.to_location_name">
              <span v-if="row.from_location_name">{{ locLabel(row.from_parent_location_name, row.from_location_name) }}</span>
              <span v-if="row.from_location_name || row.to_location_name"> → </span>
              <span v-if="row.to_location_name">{{ locLabel(row.to_parent_location_name, row.to_location_name) }}</span>
            </div>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="员工" min-width="200">
          <template #default="{ row }">
            <span v-if="row.employee_no || row.employee_name">{{ row.employee_name }}（{{ row.employee_no }}）</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="department" label="部门" min-width="140" />
        <el-table-column prop="remark" label="备注" min-width="220" />
        <el-table-column prop="created_by" label="操作人" width="120" />
      </el-table>

      <div style="margin-top:12px; display:flex; justify-content:flex-end">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next"
          :total="total"
          :page-size="pageSize"
          :current-page="page"
          @update:page-size="onSize"
          @update:current-page="onPage"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { apiDownload, apiGet, apiPost } from "../api/client";
import { can } from "../store/auth";

const q = reactive({ type: "", keyword: "", dates: [] as any[] });
const rows = ref<any[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(50);
const total = ref(0);
const selected = ref<any[]>([]);

function typeText(v: any) {
  const x = String(v || "");
  if (x === "IN") return "入库";
  if (x === "OUT") return "出库";
  if (x === "RETURN") return "归还";
  if (x === "TRANSFER") return "调拨";
  if (x === "SCRAP") return "报废";
  if (x === "ADJUST") return "调整";
  return x || "-";
}

function locLabel(p: any, c: any) {
  return [p, c].filter(Boolean).join("/");
}

function buildParams(fast: boolean) {
  const params = new URLSearchParams();
  if (fast) params.set("fast", "1");
  params.set("page", String(page.value));
  params.set("page_size", String(pageSize.value));
  if (q.type) params.set("type", q.type);
  if (q.keyword) params.set("keyword", q.keyword);
  if (q.dates?.length === 2) {
    params.set("date_from", q.dates[0]);
    params.set("date_to", q.dates[1]);
  }
  return params;
}

async function loadList() {
  loading.value = true;
  try {
    const p = buildParams(true);
    const r = await apiGet<any>(`/api/monitor-tx?${p.toString()}`);
    rows.value = r.data || [];
    const c = await apiGet<any>(`/api/monitor-tx-count?${p.toString().replace('fast=1&', '')}`);
    total.value = Number(c.data?.total || 0);
  } finally {
    loading.value = false;
  }
}

function handleMoreCommand(command: string) {
  if (command === "delete") doDelete();
}

function reload() {
  page.value = 1;
  loadList();
}

function onPage(p: number) {
  page.value = p;
  loadList();
}
function onSize(s: number) {
  pageSize.value = s;
  reload();
}

function onSel(v: any[]) {
  selected.value = v || [];
}

async function doExport() {
  try {
    const p = buildParams(false);
    const fn = `显示器出入库明细_${new Date().toISOString().slice(0, 10)}.csv`;
    await apiDownload(`/api/monitor-tx/export?${p.toString()}`, fn);
  } catch (e: any) {
    ElMessage.error(e.message || "导出失败");
  }
}

async function doDelete() {
  try {
    await ElMessageBox.confirm("删除后无法恢复，确认继续？需要输入二次确认。", "提示", { type: "warning" });
    const { value } = await ElMessageBox.prompt("请输入 删除 以确认", "二次确认", { inputPlaceholder: "删除" });
    await apiPost<any>(`/api/monitor-tx/delete`, { entries: selected.value.map((x) => ({ id: x.id })), confirm: value });
    ElMessage.success("删除成功");
    selected.value = [];
    await loadList();
  } catch (e: any) {
    if (e?.message) ElMessage.error(e.message);
  }
}

onMounted(loadList);
</script>

<style scoped>
.mb12 { margin-bottom: 12px; }
</style>
