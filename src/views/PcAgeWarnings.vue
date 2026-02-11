<template>
  <el-card>
    <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px">
      <el-tag type="warning">报废预警：出厂时间超过 {{ ageYears }} 年</el-tag>

      <el-select v-model="status" placeholder="状态" clearable style="width:160px" @change="onSearch">
        <el-option label="在库" value="IN_STOCK" />
        <el-option label="已领用" value="ASSIGNED" />
        <el-option label="已回收" value="RECYCLED" />
      </el-select>

      <el-input v-model="keyword" clearable placeholder="关键词：序列号/品牌/型号/备注" style="width: 280px" @keyup.enter="onSearch" />

      <el-button type="primary" @click="onSearch">查询</el-button>
      <el-button @click="reset">重置</el-button>

      <el-button type="danger" size="small" :loading="scrapLoading" :disabled="selectedIds.length===0" @click="createScrap()">生成报废单（选中）</el-button>

      <el-button type="success" plain size="small" :loading="exporting" @click="exportExcel(false)">导出Excel（当前页）</el-button>
      <el-button type="success" size="small" :loading="exportingAll" @click="exportExcel(true)">导出Excel（全部）</el-button>

      <div style="flex:1"></div>

      <el-button type="info" plain size="small" @click="$router.push('/pc/assets')">返回台账</el-button>
    </div>

    <el-table :data="rows" border v-loading="loading" @selection-change="onSelectionChange">
      <el-table-column type="selection" width="48" />
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column label="电脑" min-width="260">
        <template #default="{row}">
          <div style="font-weight:600">{{ row.brand }} · {{ row.model }}</div>
          <div style="color:#999;font-size:12px">SN：{{ row.serial_no }}</div>
        </template>
      </el-table-column>

      <el-table-column label="出厂时间" width="140">
        <template #default="{row}">
          <span style="font-weight:600">{{ row.manufacture_date || '-' }}</span>
        </template>
      </el-table-column>

      <el-table-column label="机龄" width="110">
        <template #default="{row}">
          <el-tag type="danger" effect="dark">{{ calcAgeYears(row.manufacture_date) }} 年</el-tag>
        </template>
      </el-table-column>

      <el-table-column label="保修" width="140">
        <template #default="{row}">
          <span>{{ row.warranty_end || '-' }}</span>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="120">
        <template #default="{row}">
          <el-tag v-if="row.status==='IN_STOCK'" type="success">在库</el-tag>
          <el-tag v-else-if="row.status==='ASSIGNED'" type="warning">已领用</el-tag>
          <el-tag v-else type="info">已回收</el-tag>
        </template>
      </el-table-column>

      <el-table-column label="当前领用人" width="220">
        <template #default="{row}">
          <div v-if="row.status==='ASSIGNED'">
            <div style="font-weight:600">{{ row.last_employee_name || '-' }}</div>
            <div style="color:#999;font-size:12px">{{ row.last_employee_no || '-' }} · {{ row.last_department || '-' }}</div>
          </div>
          <span v-else>-</span>
        </template>
      </el-table-column>

      <el-table-column prop="remark" label="备注" min-width="220" show-overflow-tooltip />
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
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { apiGet, apiPost } from "../api/client";
import { exportToXlsx } from "../utils/excel";

const ageYears = 5;

const rows = ref<any[]>([]);
const loading = ref(false);

const page = ref(1);
const pageSize = ref(50);
const total = ref(0);

const status = ref<string>("");
const keyword = ref<string>("");

const exporting = ref(false);
const exportingAll = ref(false);

function onSearch() {
  page.value = 1;
  load();
}

function reset() {
  status.value = "";
  keyword.value = "";
  page.value = 1;
  load();
}

function onPageChange() {
  load();
}
function onPageSizeChange() {
  page.value = 1;
  load();
}


function onSelectionChange(list: any[]) {
  selectedIds.value = (list || []).map((r: any) => Number(r.id)).filter((x) => Number.isFinite(x) && x > 0);
}

async function createScrap() {
  if (!selectedIds.value.length) return;

  let reason = "";
  try {
    const { value } = await ElMessageBox.prompt("请输入报废原因（可选）", "生成报废单", {
      confirmButtonText: "生成并导出",
      cancelButtonText: "取消",
      inputPlaceholder: "例如：超过使用年限 / 无法维修 / 配置过低等",
      inputType: "textarea",
      inputValue: "",
    });
    reason = String(value || "").trim();
  } catch {
    return;
  }

  try {
    scrapLoading.value = true;

    const r = await apiPost<any>("/api/pc-scrap", { asset_ids: selectedIds.value, reason });
    const scrapNo = (r as any)?.scrap_no;
    if (!scrapNo) throw new Error("生成报废单失败");

    const detail = await apiGet<any>(`/api/pc-scrap?scrap_no=${encodeURIComponent(scrapNo)}`);
    const list = (detail as any)?.data || [];

    const data = list.map((x: any) => ({
      报废单号: x.scrap_no,
      报废日期: x.scrap_date,
      品牌: x.brand,
      型号: x.model,
      序列号: x.serial_no,
      出厂时间: x.manufacture_date,
      机龄: `${calcAgeYears(x.manufacture_date)} 年`,
      保修到期: x.warranty_end || "",
      硬盘: x.disk_capacity || "",
      内存: x.memory_size || "",
      备注: x.remark || "",
      报废原因: x.reason || "",
    }));

    exportToXlsx({
      filename: `电脑仓_报废单_${scrapNo}.xlsx`,
      headers: [
        { key: "报废单号", title: "报废单号" },
        { key: "报废日期", title: "报废日期" },
        { key: "品牌", title: "品牌" },
        { key: "型号", title: "型号" },
        { key: "序列号", title: "序列号" },
        { key: "出厂时间", title: "出厂时间" },
        { key: "机龄", title: "机龄" },
        { key: "保修到期", title: "保修到期" },
        { key: "硬盘", title: "硬盘" },
        { key: "内存", title: "内存" },
        { key: "备注", title: "备注" },
        { key: "报废原因", title: "报废原因" },
      ],
      rows: data,
      sheetName: "报废单",
    });

    ElMessage.success(`已报废并导出报废单：${scrapNo}`);
    selectedIds.value = [];
    load();
  } catch (e: any) {
    ElMessage.error(e?.message || "生成报废单失败");
  } finally {
    scrapLoading.value = false;
  }
}

function calcAgeYears(dateStr: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  const now = new Date();
  let y = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) y -= 1;
  return y < 0 ? 0 : y;
}

async function load() {
  try {
    loading.value = true;
    const qs = new URLSearchParams();
    qs.set("age_years", String(ageYears));
    qs.set("page", String(page.value));
    qs.set("page_size", String(pageSize.value));
    if (status.value) qs.set("status", status.value);
    if (keyword.value.trim()) qs.set("keyword", keyword.value.trim());

    const j = await apiGet<{ ok: boolean; data: any[]; total: number }>(`/api/pc-assets?${qs.toString()}`);
    rows.value = j.data || [];
    total.value = Number((j as any).total || 0);
  } catch (e: any) {
    ElMessage.error(e?.message || "加载失败");
  } finally {
    loading.value = false;
  }
}

async function exportExcel(all: boolean) {
  if (!all) {
    try {
      scrapLoading.value = true;
      const data = rows.value.map((r) => ({
        ID: r.id,
        品牌: r.brand,
        型号: r.model,
        序列号: r.serial_no,
        出厂时间: r.manufacture_date,
        机龄: `${calcAgeYears(r.manufacture_date)} 年`,
        保修到期: r.warranty_end || "",
        状态: r.status,
        领用人: r.last_employee_name || "",
        工号: r.last_employee_no || "",
        部门: r.last_department || "",
        备注: r.remark || "",
      }));
      exportToXlsx({
        filename: `电脑仓_报废预警_当前页.xlsx`,
        headers: [
          { key: "ID", title: "ID" },
          { key: "品牌", title: "品牌" },
          { key: "型号", title: "型号" },
          { key: "序列号", title: "序列号" },
          { key: "出厂时间", title: "出厂时间" },
          { key: "机龄", title: "机龄" },
          { key: "保修到期", title: "保修到期" },
          { key: "状态", title: "状态" },
          { key: "领用人", title: "领用人" },
          { key: "工号", title: "工号" },
          { key: "部门", title: "部门" },
          { key: "备注", title: "备注" },
        ],
        rows: data,
        sheetName: "预警",
      });
      ElMessage.success("已导出（当前页）");
    } catch (e: any) {
      ElMessage.error(e?.message || "导出失败");
    } finally {
      exporting.value = false;
    }
    return;
  }

  // 导出全部：分页拉取（最多 5000 条，避免一次性太大）
  try {
    exportingAll.value = true;
    const maxRows = 5000;
    const size = 200;
    let p = 1;
    let allRows: any[] = [];
    let totalLocal = 0;
    while (allRows.length < maxRows) {
      const qs = new URLSearchParams();
      qs.set("age_years", String(ageYears));
      qs.set("page", String(p));
      qs.set("page_size", String(size));
      if (status.value) qs.set("status", status.value);
      if (keyword.value.trim()) qs.set("keyword", keyword.value.trim());
      const j = await apiGet<{ ok: boolean; data: any[]; total: number }>(`/api/pc-assets?${qs.toString()}`);
      const part = j.data || [];
      totalLocal = Number((j as any).total || 0);
      if (!part.length) break;
      allRows = allRows.concat(part);
      if (allRows.length >= totalLocal) break;
      p += 1;
    }

    if (!allRows.length) {
      ElMessage.warning("没有可导出的数据");
      return;
    }

    if (allRows.length >= maxRows && totalLocal > maxRows) {
      ElMessage.warning(`数据较多，仅导出前 ${maxRows} 条（共 ${totalLocal} 条）`);
    }

    const data = allRows.slice(0, maxRows).map((r) => ({
      ID: r.id,
      品牌: r.brand,
      型号: r.model,
      序列号: r.serial_no,
      出厂时间: r.manufacture_date,
      机龄: `${calcAgeYears(r.manufacture_date)} 年`,
      保修到期: r.warranty_end || "",
      状态: r.status,
      领用人: r.last_employee_name || "",
      工号: r.last_employee_no || "",
      部门: r.last_department || "",
      备注: r.remark || "",
    }));

    exportToXlsx({
      filename: `电脑仓_报废预警_全部.xlsx`,
      headers: [
        { key: "ID", title: "ID" },
        { key: "品牌", title: "品牌" },
        { key: "型号", title: "型号" },
        { key: "序列号", title: "序列号" },
        { key: "出厂时间", title: "出厂时间" },
        { key: "机龄", title: "机龄" },
        { key: "保修到期", title: "保修到期" },
        { key: "状态", title: "状态" },
        { key: "领用人", title: "领用人" },
        { key: "工号", title: "工号" },
        { key: "部门", title: "部门" },
        { key: "备注", title: "备注" },
      ],
      rows: data,
      sheetName: "预警",
    });
    ElMessage.success("已导出（全部）");
  } catch (e: any) {
    ElMessage.error(e?.message || "导出失败");
  } finally {
    exportingAll.value = false;
  }
}

onMounted(load);
</script>
