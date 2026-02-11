<template>
  <el-card>
    <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px">
      <el-select v-model="status" placeholder="状态" clearable style="width:160px" @change="onSearch">
        <el-option label="在库" value="IN_STOCK" />
        <el-option label="已领用" value="ASSIGNED" />
        <el-option label="已回收" value="RECYCLED" />
      </el-select>

      <el-input v-model="keyword" clearable placeholder="关键词：序列号/品牌/型号/备注" style="width: 280px" @keyup.enter="onSearch" />

      <el-button type="primary" @click="onSearch">查询</el-button>
      <el-button @click="reset">重置</el-button>

      <el-button v-if="canOperator" type="success" plain @click="$router.push('/pc/in')">电脑入库</el-button>
      <el-button v-if="canOperator" type="warning" plain @click="$router.push('/pc/out')">电脑出库</el-button>
      <el-button v-if="canOperator" type="info" plain @click="$router.push('/pc/recycle')">电脑回收/归还</el-button>
      <el-button type="info" plain @click="$router.push('/pc/tx')">出入库明细</el-button>
    
      <div style="flex:1"></div>

      <el-button size="small" @click="exportExcel">导出Excel</el-button>

      <el-button v-if="canOperator" size="small" @click="downloadAssetTemplate">下载导入模板</el-button>

      <el-upload
        v-if="canOperator"
        :show-file-list="false"
        :auto-upload="false"
        accept=".xlsx,.xls"
        :on-change="onImportAssetsFile"
      >
        <el-button size="small" type="primary">Excel导入（批量入库）</el-button>
      </el-upload>

</div>

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column label="电脑" min-width="260">
        <template #default="{row}">
          <div style="font-weight:600">{{ row.brand }} · {{ row.model }}</div>
          <div style="color:#999;font-size:12px">SN：{{ row.serial_no }}</div>
        </template>
      </el-table-column>

      <el-table-column label="配置" width="170">
        <template #default="{row}">
          <div>{{ row.disk_capacity || "-" }} / {{ row.memory_size || "-" }}</div>
          <div style="color:#999;font-size:12px">保修：{{ row.warranty_end || "-" }}</div>
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
            <div style="font-weight:600">{{ row.last_employee_name || "-" }}</div>
            <div style="color:#999;font-size:12px">{{ row.last_employee_no || "-" }} · {{ row.last_department || "-" }}</div>
          </div>
          <span v-else>-</span>
        </template>
      </el-table-column>

      <el-table-column prop="last_config_date" label="配置日期" width="130" />
      <el-table-column prop="last_recycle_date" label="回收日期" width="130" />

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
import { apiGet, apiPost } from "../api/client";
import { exportToXlsx, parseXlsx, downloadTemplate } from "../utils/excel";
import { can } from "../store/auth";

const rows = ref<any[]>([]);
const loading = ref(false);

const page = ref(1);
const pageSize = ref(50);
const total = ref(0);

const status = ref<string>("");
const keyword = ref<string>("");

const canOperator = computed(() => can("operator"));

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

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (status.value) params.set("status", status.value);
    if (keyword.value) params.set("keyword", keyword.value);
    params.set("page", String(page.value));
    params.set("page_size", String(pageSize.value));

    const r: any = await apiGet(`/api/pc-assets?${params.toString()}`);
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
    const r: any = await apiGet("/api/pc-assets", {
      status: status.value || "",
      keyword: keyword.value || "",
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
      filename: "电脑台账_仓库2.xlsx",
      sheetName: "台账",
      headers: [
        { key: "id", title: "ID" },
        { key: "status", title: "状态" },
        { key: "brand", title: "品牌" },
        { key: "serial_no", title: "序列号" },
        { key: "model", title: "型号" },
        { key: "manufacture_date", title: "出厂时间" },
        { key: "warranty_end", title: "保修到期" },
        { key: "disk_capacity", title: "硬盘容量" },
        { key: "memory_size", title: "内存大小" },
        { key: "remark", title: "备注" },
        { key: "created_at", title: "创建时间" },
        { key: "updated_at", title: "更新时间" },
      ],
      rows: all,
    });
  } catch (e: any) {
    ElMessage.error(e?.message || "导出失败");
  } finally {
    loading.value = false;
  }
}

function downloadAssetTemplate() {
  downloadTemplate({
    filename: "电脑台账导入模板.xlsx",
    headers: [
      { title: "品牌" },
      { title: "序列号" },
      { title: "型号" },
      { title: "出厂时间" },
      { title: "保修到期" },
      { title: "硬盘容量" },
      { title: "内存大小" },
      { title: "备注" },
    ],
    exampleRows: [
      {
        "品牌": "Dell",
        "序列号": "SN123456",
        "型号": "Latitude 5440",
        "出厂时间": "2024-01-01",
        "保修到期": "2027-01-01",
        "硬盘容量": "512G",
        "内存大小": "16G",
        "备注": "示例，可删除该行",
      },
    ],
  });
}

async function onImportAssetsFile(uploadFile: any) {
  const file: File = uploadFile?.raw;
  if (!file) return;
  try {
    const rows = await parseXlsx(file);
    const items = rows
      .map((r) => ({
        brand: String(r["品牌"] ?? r["brand"] ?? "").trim(),
        serial_no: String(r["序列号"] ?? r["serial_no"] ?? "").trim(),
        model: String(r["型号"] ?? r["model"] ?? "").trim(),
        manufacture_date: String(r["出厂时间"] ?? r["manufacture_date"] ?? "").trim(),
        warranty_end: String(r["保修到期"] ?? r["warranty_end"] ?? "").trim(),
        disk_capacity: String(r["硬盘容量"] ?? r["disk_capacity"] ?? "").trim(),
        memory_size: String(r["内存大小"] ?? r["memory_size"] ?? "").trim(),
        remark: String(r["备注"] ?? r["remark"] ?? "").trim(),
      }))
      .filter((x) => x.brand || x.serial_no || x.model);

    if (!items.length) {
      ElMessage.warning("Excel里没有可导入的数据");
      return;
    }

    const res: any = await apiPost("/api/pc-in-batch", { items });
    const failed = Number(res?.failed || 0);
    if (failed > 0) {
      ElMessage.warning(`导入完成：成功 ${res.success} 条，失败 ${failed} 条（请查看控制台/接口返回 errors）`);
      console.warn("pc-in-batch errors", res?.errors);
    } else {
      ElMessage.success(`导入完成：成功 ${res.success} 条`);
    }

    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || "导入失败");
  }
}

onMounted(load);
</script>
