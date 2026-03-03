<template>
  <el-card>
    <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px">
      <el-select v-model="status" placeholder="状态" clearable style="width:160px" @change="onSearch">
        <el-option label="在库" value="IN_STOCK" />
        <el-option label="已领用" value="ASSIGNED" />
        <el-option label="已回收" value="RECYCLED" />
        <el-option label="已报废" value="SCRAPPED" />
      </el-select>

      <el-input v-model="keyword" clearable placeholder="关键词：序列号/品牌/型号/备注" style="width: 280px" @keyup.enter="onSearch" />

      <el-button type="primary" @click="onSearch">查询</el-button>
      <el-button @click="reset">重置</el-button>

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
      <el-table-column label="ID" width="80">
        <template #default="{$index}">{{ serialNo($index) }}</template>
      </el-table-column>
      <el-table-column label="电脑" min-width="260">
        <template #default="{row}">
          <div
            style="font-weight:600; cursor:pointer"
            title="点击查看电脑信息"
            @click="openInfo(row)"
          >
            {{ row.brand }} · {{ row.model }}
          </div>
          <div style="color:#999;font-size:12px; cursor:pointer" @click="openInfo(row)">SN：{{ row.serial_no }}</div>
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


      <el-table-column v-if="canOperator" label="操作" width="220" fixed="right">
        <template #default="{row}">
          <el-button link type="primary" @click="openEdit(row)">修改</el-button>
          <el-button link @click="openQr(row)">二维码</el-button>
          <el-button v-if="isAdmin" link type="danger" @click="removeAsset(row)">删除</el-button>
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
  
    <el-dialog v-model="editVisible" title="修改电脑台账" width="680px" destroy-on-close>
      <el-form :model="editForm" label-width="90px">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="品牌"><el-input v-model="editForm.brand" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="型号"><el-input v-model="editForm.model" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="序列号"><el-input v-model="editForm.serial_no" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="出厂时间"><el-input v-model="editForm.manufacture_date" placeholder="YYYY-MM-DD" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="保修到期"><el-input v-model="editForm.warranty_end" placeholder="YYYY-MM-DD" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="硬盘容量"><el-input v-model="editForm.disk_capacity" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="内存大小"><el-input v-model="editForm.memory_size" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="备注"><el-input v-model="editForm.remark" type="textarea" :rows="3" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="editVisible=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="infoVisible" title="电脑信息" width="720px" destroy-on-close>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="品牌">{{ infoRow?.brand || '-' }}</el-descriptions-item>
        <el-descriptions-item label="型号">{{ infoRow?.model || '-' }}</el-descriptions-item>
        <el-descriptions-item label="序列号">{{ infoRow?.serial_no || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag v-if="infoRow?.status==='IN_STOCK'" type="success">在库</el-tag>
          <el-tag v-else-if="infoRow?.status==='ASSIGNED'" type="warning">已领用</el-tag>
          <el-tag v-else-if="infoRow?.status==='RECYCLED'" type="info">已回收</el-tag>
          <el-tag v-else type="danger">已报废</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="出厂日期">{{ infoRow?.manufacture_date || '-' }}</el-descriptions-item>
        <el-descriptions-item label="保修到期">{{ infoRow?.warranty_end || '-' }}</el-descriptions-item>
        <el-descriptions-item label="硬盘容量">{{ infoRow?.disk_capacity || '-' }}</el-descriptions-item>
        <el-descriptions-item label="内存大小">{{ infoRow?.memory_size || '-' }}</el-descriptions-item>
        <el-descriptions-item label="配置日期">{{ infoRow?.last_config_date || '-' }}</el-descriptions-item>
        <el-descriptions-item label="回收日期">{{ infoRow?.last_recycle_date || '-' }}</el-descriptions-item>
        <el-descriptions-item label="当前领用人" :span="2">
          <div v-if="infoRow?.status==='ASSIGNED'">
            <div style="font-weight:600">{{ infoRow?.last_employee_name || '-' }}</div>
            <div style="color:#999;font-size:12px">{{ infoRow?.last_employee_no || '-' }} · {{ infoRow?.last_department || '-' }}</div>
          </div>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">
          <div style="white-space:pre-wrap">{{ infoRow?.remark || '-' }}</div>
        </el-descriptions-item>
      </el-descriptions>

      <template #footer>
        <el-button @click="infoVisible=false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="qrVisible" title="扫码查看电脑信息" width="420px" destroy-on-close>
      <div v-loading="qrLoading" style="display:flex;flex-direction:column;gap:12px;align-items:center">
        <div v-if="qrDataUrl" style="background:#fff;padding:10px;border-radius:10px;border:1px solid #eee">
          <img :src="qrDataUrl" alt="QR" style="width:260px;height:260px;display:block" />
        </div>
        <div style="width:100%">
          <el-input v-model="qrLink" readonly>
            <template #append>
              <el-button @click="copyQrLink">复制</el-button>
            </template>
          </el-input>
        </div>
        <div style="display:flex;gap:10px;justify-content:center;width:100%">
          <el-button :disabled="!qrDataUrl" @click="downloadQr">下载二维码</el-button>
          <el-button type="primary" :disabled="!qrLink" @click="openQrInNewTab">打开页面</el-button>
          <el-button v-if="isAdmin" type="danger" plain :disabled="!qrRow" @click="resetQr">重置二维码</el-button>
        </div>
        <div style="color:#999;font-size:12px;line-height:1.5;text-align:center">
          提示：这是“可控长期码”。你修改电脑信息后，扫码会自动展示最新数据；管理员可重置二维码使旧码立即失效。
        </div>
      </div>
      <template #footer>
        <el-button @click="qrVisible=false">关闭</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { apiGet, apiPost, apiPut, apiDelete } from "../api/client";
import { exportToXlsx, parseXlsx, downloadTemplate } from "../utils/excel";
import { can } from "../store/auth";
import QRCode from "qrcode";

const rows = ref<any[]>([]);
const loading = ref(false);

const page = ref(1);
const pageSize = ref(50);
const total = ref(0);

// PERF: total 统计结果缓存（按筛选条件），避免每次翻页都重复 COUNT(*)。
const totalCache = new Map<string, number>();
let totalTimer: any = null;

function filterKey() {
  return `status=${status.value || ""}&keyword=${keyword.value || ""}`;
}

const status = ref<string>("");
const keyword = ref<string>("");

const canOperator = computed(() => can("operator"));
const isAdmin = computed(() => can("admin"));

const qrVisible = ref(false);
const qrLoading = ref(false);
const qrDataUrl = ref<string>("");
const qrLink = ref<string>("");
const qrRow = ref<any>(null);

async function openQr(row: any) {
  qrRow.value = row;
  qrVisible.value = true;
  qrLoading.value = true;
  qrDataUrl.value = "";
  qrLink.value = "";
  try {
    const r: any = await apiGet(`/api/pc-asset-qr-token?id=${encodeURIComponent(String(row.id))}`);
    qrLink.value = r.url;
    qrDataUrl.value = await QRCode.toDataURL(r.url, { width: 260, margin: 1 });
  } catch (e: any) {
    ElMessage.error(e?.message || "生成二维码失败");
    qrVisible.value = false;
  } finally {
    qrLoading.value = false;
  }
}

async function resetQr() {
  try {
    if (!qrRow.value?.id) return;
    await ElMessageBox.confirm(
      "确认要重置该电脑的二维码吗？重置后旧二维码将立即失效。",
      "重置二维码",
      { type: "warning" }
    );
    qrLoading.value = true;
    const r: any = await apiPost(`/api/pc-assets-reset-qr?id=${encodeURIComponent(String(qrRow.value.id))}`, {});
    qrLink.value = r.url;
    qrDataUrl.value = await QRCode.toDataURL(r.url, { width: 260, margin: 1 });
    ElMessage.success("已重置，新二维码已生成");
  } catch (e: any) {
    if (e?.message) ElMessage.error(e.message);
  } finally {
    qrLoading.value = false;
  }
}

async function copyQrLink() {
  try {
    if (!qrLink.value) return;
    await navigator.clipboard.writeText(qrLink.value);
    ElMessage.success("已复制");
  } catch {
    // fallback
    const ta = document.createElement("textarea");
    ta.value = qrLink.value;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    ElMessage.success("已复制");
  }
}

function downloadQr() {
  if (!qrDataUrl.value) return;
  const a = document.createElement("a");
  const sn = (qrRow.value?.serial_no || qrRow.value?.id || "pc").toString();
  a.download = `PC_${sn}_二维码.png`;
  a.href = qrDataUrl.value;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function openQrInNewTab() {
  if (!qrLink.value) return;
  window.open(qrLink.value, "_blank");
}

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

    // PERF: 首屏先走 fast=1 跳过 COUNT(*)，让表格尽快出数据；
    // total 再异步拉取 /api/pc-assets-count 补齐。
    params.set("fast", "1");

    const r: any = await apiGet(`/api/pc-assets?${params.toString()}`);
    rows.value = r.data || [];

    const key = filterKey();
    // 如果已有缓存 total，直接复用，不再触发 count。
    if (totalCache.has(key)) {
      total.value = Number(totalCache.get(key) || 0);
      return;
    }

    // 如果后端没返回 total（fast 模式），异步补齐 total，不阻塞首屏。
    if (r.total === null || typeof r.total === "undefined") {
      // PERF: 1) debounce，避免用户快速输入/切换导致多次 COUNT；
      //       2) 仅在当前筛选条件下请求一次并缓存。
      if (totalTimer) clearTimeout(totalTimer);
      totalTimer = setTimeout(() => {
        const params2 = new URLSearchParams();
        if (status.value) params2.set("status", status.value);
        if (keyword.value) params2.set("keyword", keyword.value);
        apiGet(`/api/pc-assets-count?${params2.toString()}`)
          .then((j: any) => {
            const v = Number(j.total || 0);
            totalCache.set(filterKey(), v);
            total.value = v;
          })
          .catch(() => {
            // ignore
          });
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



const editVisible = ref(false);
const saving = ref(false);
const editForm = ref<any>({
  id: 0, brand: "", model: "", serial_no: "", manufacture_date: "", warranty_end: "", disk_capacity: "", memory_size: "", remark: ""
});

function serialNo(index: number) {
  return (page.value - 1) * pageSize.value + index + 1;
}

function openEdit(row: any) {
  editForm.value = {
    id: row.id,
    brand: row.brand || "",
    model: row.model || "",
    serial_no: row.serial_no || "",
    manufacture_date: row.manufacture_date || "",
    warranty_end: row.warranty_end || "",
    disk_capacity: row.disk_capacity || "",
    memory_size: row.memory_size || "",
    remark: row.remark || "",
  };
  editVisible.value = true;
}

const infoVisible = ref(false);
const infoRow = ref<any>(null);

function openInfo(row: any) {
  // 列表数据已包含大部分字段；这里直接展示
  infoRow.value = { ...row };
  infoVisible.value = true;
}

async function saveEdit() {
  const f = editForm.value || {};
  if (!String(f.brand || "").trim()) return ElMessage.warning("品牌必填");
  if (!String(f.model || "").trim()) return ElMessage.warning("型号必填");
  if (!String(f.serial_no || "").trim()) return ElMessage.warning("序列号必填");
  try {
    saving.value = true;
    await apiPut('/api/pc-assets', f);
    ElMessage.success('修改成功');
    editVisible.value = false;
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '修改失败');
  } finally {
    saving.value = false;
  }
}

async function removeAsset(row: any) {
  try {
    await ElMessageBox.confirm(`确认删除电脑台账：${row.brand || ''} ${row.model || ''}（SN: ${row.serial_no || '-'}）？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    });
    loading.value = true;
    await apiDelete('/api/pc-assets', { id: row.id });
    ElMessage.success('删除成功');
    if (rows.value.length === 1 && page.value > 1) page.value -= 1;
    await load();
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.message || '删除失败');
  } finally {
    loading.value = false;
  }
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
      rows: all.map((r:any)=>({ ...r, created_at: formatBeijingDateTime(r.created_at), updated_at: formatBeijingDateTime(r.updated_at) })),
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

    // 出厂时间必填：优先在前端拦截，提示缺失行号
    const missing = items
      .map((it, idx) => ({ idx, v: String(it.manufacture_date || "").trim() }))
      .filter((x) => !x.v)
      .slice(0, 15)
      .map((x) => x.idx + 2);
    if (missing.length) {
      ElMessage.warning(`出厂时间必填，缺失行号：${missing.join(", ")}${missing.length >= 15 ? " …" : ""}`);
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
