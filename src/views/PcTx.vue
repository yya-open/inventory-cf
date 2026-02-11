<template>
  <el-card>
    <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px">
      <el-select v-model="type" placeholder="类型" clearable style="width:140px" @change="onSearch">
        <el-option label="入库(IN)" value="IN" />
        <el-option label="出库(OUT)" value="OUT" />
        <el-option label="归还(RETURN)" value="RETURN" />
        <el-option label="回收(RECYCLE)" value="RECYCLE" />
      </el-select>

      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="到"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
      />

      <el-input v-model="keyword" clearable placeholder="关键词：单号/序列号/员工/部门/品牌/型号" style="width: 260px" @keyup.enter="onSearch" />

      <el-button type="primary" @click="onSearch">查询</el-button>
      <el-button @click="reset">重置</el-button>

      <el-button type="info" plain @click="$router.push('/pc/assets')">返回台账</el-button>
    
      <div style="flex:1"></div>
      <el-button size="small" @click="exportExcel">导出Excel</el-button>
      <el-button v-if="canOperator" size="small" @click="downloadTxTemplate">下载导入模板</el-button>
      <el-upload
        v-if="canOperator"
        :show-file-list="false"
        :auto-upload="false"
        accept=".xlsx,.xls"
        :on-change="onImportTxFile"
      >
        <el-button size="small" type="primary">Excel导入（按类型写入记录）</el-button>
      </el-upload>

</div>

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="created_at" label="时间" width="170" />
      <el-table-column prop="tx_no" label="单号" width="210" />
      <el-table-column prop="type" label="类型" width="110">
        <template #default="{row}">
          <el-tag v-if="row.type==='IN'" type="success">入库</el-tag>
          <el-tag v-else-if="row.type==='OUT'" type="danger">出库</el-tag>
          <el-tag v-else-if="row.type==='RETURN'" type="warning">归还</el-tag>
          <el-tag v-else type="info">回收</el-tag>
        </template>
      </el-table-column>

      <el-table-column label="电脑" min-width="260">
        <template #default="{row}">
          <div style="font-weight:600">{{ row.brand }} · {{ row.model }}</div>
          <div style="color:#999;font-size:12px">SN：{{ row.serial_no }}</div>
        </template>
      </el-table-column>

      <el-table-column label="员工" width="220">
        <template #default="{row}">
          <div v-if="row.type!=='IN'">
            <div style="font-weight:600">{{ row.employee_name || "-" }}</div>
            <div style="color:#999;font-size:12px">{{ row.employee_no || "-" }} · {{ row.department || "-" }}</div>
          </div>
          <span v-else>-</span>
        </template>
      </el-table-column>

      <el-table-column prop="config_date" label="配置日期" width="130" />
      <el-table-column prop="recycle_date" label="回收/归还日期" width="130" />
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
import { ref, onMounted, computed } from "vue";
import { ElMessage } from "element-plus";
import { exportToXlsx, parseXlsx, downloadTemplate } from "../utils/excel";
import { apiGet, apiPost } from "../api/client";
import { can } from "../store/auth";

const canOperator = computed(() => can("operator"));

const rows = ref<any[]>([]);
const loading = ref(false);

const page = ref(1);
const pageSize = ref(50);
const total = ref(0);

const type = ref<string>("");
const keyword = ref<string>("");
const dateRange = ref<[string, string] | null>(null);

function onSearch() {
  page.value = 1;
  load();
}

function reset() {
  type.value = "";
  keyword.value = "";
  dateRange.value = null;
  page.value = 1;
  load();
}

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (type.value) params.set("type", type.value);
    if (keyword.value) params.set("keyword", keyword.value);
    if (dateRange.value?.[0]) params.set("date_from", `${dateRange.value[0]} 00:00:00`);
    if (dateRange.value?.[1]) params.set("date_to", `${dateRange.value[1]} 23:59:59`);
    params.set("page", String(page.value));
    params.set("page_size", String(pageSize.value));

    const r: any = await apiGet(`/api/pc-tx?${params.toString()}`);
    rows.value = r.data || [];
    total.value = Number(r.total || 0);
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



async function fetchAll() {
  const all: any[] = [];
  let p = 1;
  let totalLocal = 0;
  do {
    const r: any = await apiGet("/api/pc-tx", {
      type: type.value || "",
      keyword: keyword.value || "",
      date_from: dateFrom.value || "",
      date_to: dateTo.value || "",
      page: p,
      page_size: 200,
    });
    const rows = r?.data || [];
    totalLocal = Number(r?.total || 0);
    all.push(...rows);
    p++;
    if (all.length >= totalLocal) break;
  } while (p < 999);
  return all;
}

async function exportExcel() {
  try {
    loading.value = true;
    const all = await fetchAll();
    exportToXlsx({
      filename: "电脑出入库明细_仓库2.xlsx",
      sheetName: "明细",
      headers: [
        { key: "created_at", title: "时间" },
        { key: "tx_no", title: "单号" },
        { key: "type", title: "类型" },
        { key: "brand", title: "品牌" },
        { key: "serial_no", title: "序列号" },
        { key: "model", title: "型号" },
        { key: "employee_no", title: "员工工号" },
        { key: "department", title: "部门" },
        { key: "employee_name", title: "员工姓名" },
        { key: "is_employed", title: "是否在职" },
        { key: "config_date", title: "配置日期" },
        { key: "recycle_date", title: "回收/归还日期" },
        { key: "remark", title: "备注" },
      ],
      rows: all,
    });
  } catch (e: any) {
    ElMessage.error(e?.message || "导出失败");
  } finally {
    loading.value = false;
  }
}

function downloadTxTemplate() {
  downloadTemplate({
    filename: "电脑明细导入模板.xlsx",
    headers: [
      { title: "类型" }, // IN / OUT / RETURN / RECYCLE 或 入库/出库/归还/回收
      { title: "品牌" },
      { title: "序列号" },
      { title: "型号" },
      { title: "出厂时间" },
      { title: "保修到期" },
      { title: "硬盘容量" },
      { title: "内存大小" },
      { title: "员工工号" },
      { title: "部门" },
      { title: "员工姓名" },
      { title: "是否在职" },
      { title: "配置日期" },
      { title: "回收日期" },
      { title: "动作" }, // RETURN/RECYCLE 或 归还/回收（回收/归还记录可用）
      { title: "备注" },
    ],
    exampleRows: [
      {
        "类型": "IN",
        "品牌": "Dell",
        "序列号": "SN123456",
        "型号": "Latitude 5440",
        "出厂时间": "2024-01-01",
        "保修到期": "2027-01-01",
        "硬盘容量": "512G",
        "内存大小": "16G",
        "备注": "示例：入库记录",
      },
      {
        "类型": "OUT",
        "序列号": "SN123456",
        "员工工号": "E0001",
        "部门": "IT",
        "员工姓名": "张三",
        "是否在职": "在职",
        "配置日期": "2026-02-11",
        "备注": "示例：出库记录",
      },
      {
        "类型": "RETURN",
        "序列号": "SN123456",
        "动作": "归还",
        "回收日期": "2026-03-01",
        "备注": "示例：归还记录",
      },
    ],
  });
}

function normType(v: any) {
  const t = String(v ?? "").trim().toUpperCase();
  if (t === "IN" || t === "入库") return "IN";
  if (t === "OUT" || t === "出库") return "OUT";
  if (t === "RETURN" || t === "归还") return "RETURN";
  if (t === "RECYCLE" || t === "回收") return "RECYCLE";
  return "";
}

async function onImportTxFile(uploadFile: any) {
  const file: File = uploadFile?.raw;
  if (!file) return;

  try {
    const rows = await parseXlsx(file);

    const inItems: any[] = [];
    const outItems: any[] = [];
    const recycleItems: any[] = []; // includes RETURN/RECYCLE

    rows.forEach((r) => {
      const t = normType(r["类型"] ?? r["type"]);
      if (!t) return;

      if (t === "IN") {
        inItems.push({
          brand: String(r["品牌"] ?? r["brand"] ?? "").trim(),
          serial_no: String(r["序列号"] ?? r["serial_no"] ?? "").trim(),
          model: String(r["型号"] ?? r["model"] ?? "").trim(),
          manufacture_date: String(r["出厂时间"] ?? r["manufacture_date"] ?? "").trim(),
          warranty_end: String(r["保修到期"] ?? r["warranty_end"] ?? "").trim(),
          disk_capacity: String(r["硬盘容量"] ?? r["disk_capacity"] ?? "").trim(),
          memory_size: String(r["内存大小"] ?? r["memory_size"] ?? "").trim(),
          remark: String(r["备注"] ?? r["remark"] ?? "").trim(),
        });
      } else if (t === "OUT") {
        outItems.push({
          serial_no: String(r["序列号"] ?? r["serial_no"] ?? "").trim(),
          employee_no: String(r["员工工号"] ?? r["employee_no"] ?? "").trim(),
          department: String(r["部门"] ?? r["department"] ?? "").trim(),
          employee_name: String(r["员工姓名"] ?? r["employee_name"] ?? "").trim(),
          is_employed: String(r["是否在职"] ?? r["is_employed"] ?? "").trim(),
          config_date: String(r["配置日期"] ?? r["config_date"] ?? "").trim(),
          remark: String(r["备注"] ?? r["remark"] ?? "").trim(),
        });
      } else {
        recycleItems.push({
          serial_no: String(r["序列号"] ?? r["serial_no"] ?? "").trim(),
          action: String(r["动作"] ?? r["action"] ?? (t === "RETURN" ? "RETURN" : "RECYCLE")).trim(),
          recycle_date: String(r["回收日期"] ?? r["回收/归还日期"] ?? r["recycle_date"] ?? "").trim(),
          remark: String(r["备注"] ?? r["remark"] ?? "").trim(),
        });
      }
    });

    let okSum = 0;
    let failSum = 0;

    if (inItems.length) {
      const res: any = await apiPost("/api/pc-in-batch", { items: inItems });
      okSum += Number(res?.success || 0);
      failSum += Number(res?.failed || 0);
      if (res?.failed) console.warn("pc-in-batch errors", res?.errors);
    }

    if (outItems.length) {
      const res: any = await apiPost("/api/pc-out-batch", { items: outItems });
      okSum += Number(res?.success || 0);
      failSum += Number(res?.failed || 0);
      if (res?.failed) console.warn("pc-out-batch errors", res?.errors);
    }

    if (recycleItems.length) {
      const res: any = await apiPost("/api/pc-recycle-batch", { items: recycleItems });
      okSum += Number(res?.success || 0);
      failSum += Number(res?.failed || 0);
      if (res?.failed) console.warn("pc-recycle-batch errors", res?.errors);
    }

    if (okSum === 0 && failSum === 0) {
      ElMessage.warning("Excel里没有可导入的数据（请检查“类型”列）");
      return;
    }

    if (failSum > 0) {
      ElMessage.warning(`导入完成：成功 ${okSum} 条，失败 ${failSum} 条（详情见控制台/接口返回 errors）`);
    } else {
      ElMessage.success(`导入完成：成功 ${okSum} 条`);
    }

    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || "导入失败");
  }
}

onMounted(load);
</script>
