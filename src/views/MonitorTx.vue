<template>
  <div>
    <el-card
      shadow="never"
      class="ui-page-card mb12"
    >
      <div class="ui-toolbar ui-toolbar--ledger">
        <div class="ui-toolbar-main">
          <div class="ui-toolbar-block">
            <div class="ui-toolbar-title">
              筛选查询
            </div>
            <div class="ui-toolbar-row">
              <el-select
                v-model="q.type"
                placeholder="动作"
                clearable
                class="ui-toolbar-select"
                @change="reload()"
              >
                <el-option
                  label="入库"
                  value="IN"
                />
                <el-option
                  label="出库"
                  value="OUT"
                />
                <el-option
                  label="归还"
                  value="RETURN"
                />
                <el-option
                  label="调拨"
                  value="TRANSFER"
                />
                <el-option
                  label="报废"
                  value="SCRAP"
                />
                <el-option
                  label="调整"
                  value="ADJUST"
                />
              </el-select>

              <el-date-picker
                v-model="q.dates"
                type="daterange"
                unlink-panels
                range-separator="-"
                start-placeholder="开始"
                end-placeholder="结束"
                value-format="YYYY-MM-DD"
                class="ui-toolbar-date"
                @change="reload()"
              />

              <el-input
                v-model="q.keyword"
                placeholder="关键词：资产编号/SN/员工/备注"
                clearable
                class="ui-toolbar-input"
                @keyup.enter="reload()"
              />

              <div class="ui-toolbar-actions">
                <el-button
                  type="primary"
                  @click="reload()"
                >
                  查询
                </el-button>
              </div>
            </div>
          </div>
        </div>

        <div class="ui-toolbar-side">
          <div class="ui-toolbar-block">
            <div class="ui-toolbar-title">
              快捷工具
            </div>
            <div class="ui-toolbar-tool-grid">
              <el-button @click="doExport">
                导出
              </el-button>
              <el-button
                v-if="can('admin')"
                type="danger"
                plain
                :disabled="!selected.length"
                @click="doDelete"
              >
                删除
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <el-card shadow="never">
      <el-table
        v-loading="loading"
        :data="rows"
        size="small"
        border
        @selection-change="onSel"
      >
        <el-table-column
          type="selection"
          width="44"
        />
        <el-table-column
          prop="created_at"
          label="时间"
          min-width="170"
        />
        <el-table-column
          label="动作"
          width="120"
        >
          <template #default="{ row }">
            <div>{{ typeText(row.tx_type) }}</div>
            <el-tag v-if="row.is_current_effective" type="success" effect="plain" size="small" style="margin-top:6px">当前生效</el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="asset_code"
          label="资产编号"
          min-width="160"
        />
        <el-table-column
          label="型号"
          min-width="200"
        >
          <template #default="{ row }">
            {{ [row.brand, row.model].filter(Boolean).join(' ') }}
          </template>
        </el-table-column>
        <el-table-column
          label="员工"
          min-width="200"
        >
          <template #default="{ row }">
            <span v-if="row.employee_no || row.employee_name">{{ row.employee_name }}（{{ row.employee_no }}）</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column
          prop="remark"
          label="备注"
          min-width="220"
        />
        <el-table-column
          prop="created_by"
          label="操作人"
          width="120"
        />
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
import { ElMessage, ElMessageBox } from "../utils/el-services";
import { apiDownload, apiGet, apiPost } from "../api/client";
import { can } from "../store/auth";

const q = reactive({ type: "", keyword: "", dates: [] as any[] });
const rows = ref<any[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(50);
const total = ref(0);
const selected = ref<any[]>([]);
const totalCache = new Map<string, number>();
let totalTimer: ReturnType<typeof setTimeout> | null = null;

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


function filterKey() {
  return JSON.stringify({ type: q.type || "", keyword: q.keyword || "", dates: q.dates || [] });
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

    const key = filterKey();
    if (totalCache.has(key)) {
      total.value = Number(totalCache.get(key) || 0);
      return;
    }

    if (r.total === null || typeof r.total === 'undefined') {
      if (totalTimer) clearTimeout(totalTimer);
      totalTimer = setTimeout(() => {
        const p2 = buildParams(false);
        apiGet<any>(`/api/monitor-tx-count?${p2.toString()}`)
          .then((j: any) => {
            const v = Number(j?.data?.total || j?.total || 0);
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
  } finally {
    loading.value = false;
  }
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
