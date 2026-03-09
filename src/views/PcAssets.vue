<template>
  <el-card class="asset-page-card">
    <div class="asset-toolbar">
      <div class="toolbar-left">
        <div class="toolbar-block toolbar-search">
          <div class="toolbar-block-title">筛选查询</div>
          <div class="toolbar-row">
            <el-select v-model="status" placeholder="状态" clearable class="toolbar-select" @change="onSearch">
              <el-option label="在库" value="IN_STOCK" />
              <el-option label="已领用" value="ASSIGNED" />
              <el-option label="已回收" value="RECYCLED" />
              <el-option label="已报废" value="SCRAPPED" />
            </el-select>

            <el-input v-model="keyword" clearable placeholder="关键词：序列号/品牌/型号/备注" class="toolbar-input" @keyup.enter="onSearch" />

            <div class="toolbar-actions-inline">
              <el-button type="primary" @click="onSearch">查询</el-button>
              <el-button @click="reset">重置</el-button>
            </div>
          </div>
        </div>

      </div>

      <div class="toolbar-right">
        <div class="toolbar-block toolbar-tools">
          <div class="toolbar-block-title">快捷工具</div>
          <div class="toolbar-tool-row">
            <el-button @click="exportExcel">导出Excel</el-button>
            <el-button v-if="canOperator" @click="downloadAssetTemplate">下载导入模板</el-button>
            <el-upload
              v-if="canOperator"
              class="toolbar-upload toolbar-upload-inline"
              :show-file-list="false"
              :auto-upload="false"
              accept=".xlsx,.xls"
              :on-change="onImportAssetsFile"
            >
              <el-button type="primary">Excel导入</el-button>
            </el-upload>
            <el-button v-if="isAdmin" @click="handleAssetMoreCommand('initQr')">初始化二维码Key</el-button>
          </div>
        </div>
      </div>
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

    <el-dialog
      v-model="qrVisible"
      class="qr-dialog"
      width="560px"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <template #header>
        <div class="qr-header">
          <div class="qr-title">
            <span class="qr-title-main">扫码查看电脑信息</span>
            <span class="qr-title-sub">可控长期码 · 信息实时更新</span>
          </div>
          <el-tag size="small" type="info" effect="plain" v-if="qrRow">
            {{ qrRow.brand }} · {{ qrRow.model }}
          </el-tag>
        </div>
      </template>

      <div class="qr-body" v-loading="qrLoading">
        <div class="qr-left">
          <div class="qr-card">
          <div class="qr-box" v-if="qrDataUrl">
            <img :src="qrDataUrl" alt="QR" />
          </div>
          <div class="qr-box qr-box-empty" v-else>
            <div style="color:#999">暂无二维码</div>
          </div>

          <div class="qr-meta" v-if="qrRow">
            <div class="qr-meta-line"><span class="k">SN</span><span class="v">{{ qrRow.serial_no || '-' }}</span></div>
            <div class="qr-meta-line"><span class="k">状态</span><span class="v">{{ statusText(qrRow.status) }}</span></div>
          </div>
        </div>
        </div>

        <div class="qr-right">
          <div class="qr-actions">
            <div class="qr-action-group">
              <div class="qr-action-title">下载</div>
              <div class="qr-action-buttons">
                <el-button :disabled="!qrDataUrl" @click="downloadQr">下载二维码</el-button>
                <el-button :disabled="!qrLink" @click="downloadLabel">下载标签(50×30)</el-button>
              </div>
            </div>

            <div class="qr-action-group">
              <div class="qr-action-title">操作</div>
              <div class="qr-action-buttons">
                <el-button type="primary" :disabled="!qrLink" @click="openQrInNewTab">打开页面</el-button>
                <el-button v-if="isAdmin" type="danger" plain :disabled="!qrRow?.id" @click="resetQr">重置二维码</el-button>
              </div>
            </div>
          </div>

          <div class="qr-link">
            <div class="qr-link-label">链接</div>
            <el-input v-model="qrLink" readonly>
              <template #append>
                <el-button @click="copyQrLink">复制</el-button>
              </template>
            </el-input>
          </div>

          <el-alert
            class="qr-tip"
            type="success"
            show-icon
            :closable="false"
            title="提示"
            description="修改电脑信息后，扫码会自动展示最新数据；管理员重置二维码后旧码立即失效。"
          />
        </div>
      </div>

      <template #footer>
        <div class="qr-footer">
          <div class="qr-footnote">建议打印标签时选择“实际大小/100%”，二维码边长 ≥ 25mm 更易识别。</div>
          <el-button @click="qrVisible=false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { apiGet, apiPost, apiPut, apiDelete } from "../api/client";
import { exportToXlsx, parseXlsx, downloadTemplate } from "../utils/excel";
import { formatBeijingDateTime } from "../utils/datetime";
import { can } from "../store/auth";
import QRCode from "qrcode";

function statusText(s: string) {
  if (s === "IN_STOCK") return "在库";
  if (s === "ASSIGNED") return "已领用";
  if (s === "RECYCLED") return "已回收";
  if (s === "SCRAPPED") return "已报废";
  return s || "-";
}

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

function handleAssetMoreCommand(command: string) {
  if (command === "initQr") initQrKeys();
}

async function initQrKeys() {
  try {
    await ElMessageBox.confirm(
      "将为所有缺少二维码Key的电脑批量生成Key（分批执行）。继续？",
      "初始化二维码Key",
      { type: "warning" }
    );
    loading.value = true;
    let totalUpdated = 0;
    for (let i = 0; i < 20; i++) {
      // 每次补齐 200 条，最多循环 20 次防止误操作（足够覆盖 4000 台）
      const r: any = await apiPost(`/api/pc-assets-init-qr-keys?batch=200`, {});
      const n = Number(r?.updated || 0);
      totalUpdated += n;
      if (!n) break;
    }
    ElMessage.success(totalUpdated ? `已补齐 ${totalUpdated} 台电脑的二维码Key` : "无需补齐（都已存在）");
  } catch (e: any) {
    if (e?.message) ElMessage.error(e.message);
  } finally {
    loading.value = false;
  }
}

async function openQr(row: any) {
  qrRow.value = row;
  qrVisible.value = true;
  qrLoading.value = true;
  qrDataUrl.value = "";
  qrLink.value = "";
  try {
    const r: any = await apiGet(`/api/pc-asset-qr-token?id=${encodeURIComponent(String(row.id))}`);
    qrLink.value = r.url;
    // 工位贴纸场景：提高容错(Q) + 留足白边，抗反光/磨损更稳
    qrDataUrl.value = await QRCode.toDataURL(r.url, { width: 260, margin: 3, errorCorrectionLevel: 'Q' });
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
    qrDataUrl.value = await QRCode.toDataURL(r.url, { width: 260, margin: 3, errorCorrectionLevel: 'Q' });
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

function mmToPx(mm: number, dpi = 300) {
  return Math.round((mm / 25.4) * dpi);
}

function downloadLabel() {
  if (!qrLink.value) return;
  const row = qrRow.value || {};
  const title = `${row.brand || ""} ${row.model || ""}`.trim() || "电脑信息";
  const sn = (row.serial_no || row.id || "").toString();

  // 50x30mm @300dpi
  const W = mmToPx(50);
  const H = mmToPx(30);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // background
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  // margins
  const pad = Math.round(W * 0.04); // ~4%
  const topH = Math.round(H * 0.22);
  const bottomH = Math.round(H * 0.18);

  // title (top)
  ctx.fillStyle = "#111";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.round(H * 0.12)}px sans-serif`;
  const maxTitleW = W - pad * 2;
  // truncate
  let t = title;
  while (ctx.measureText(t).width > maxTitleW && t.length > 6) t = t.slice(0, -1);
  if (t !== title) t = t + "…";
  ctx.fillText(t, pad, Math.round(topH / 2));

  // QR area
  const qrAreaTop = topH;
  const qrAreaH = H - topH - bottomH;
  const qrSize = Math.min(qrAreaH, Math.round(W * 0.52));
  const qrX = Math.round((W - qrSize) / 2);
  const qrY = qrAreaTop + Math.round((qrAreaH - qrSize) / 2);

  // draw QR (generate on the fly for crispness)
  // Using QRCode.toCanvas would be ideal, but we already have QRCode imported; use toDataURL with width=qrSize
  QRCode.toDataURL(qrLink.value, { width: qrSize, margin: 3, errorCorrectionLevel: 'Q' })
    .then((dataUrl: string) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

        // bottom SN
        ctx.fillStyle = "#111";
        ctx.font = `${Math.round(H * 0.11)}px monospace`;
        const bottomY = H - Math.round(bottomH / 2);
        const snText = sn ? `SN: ${sn}` : "";
        // center
        const tw = ctx.measureText(snText).width;
        ctx.fillText(snText, Math.max(pad, Math.round((W - tw) / 2)), bottomY);

        // export
        const a = document.createElement("a");
        const name = (sn || row.id || "pc").toString();
        a.download = `PC_${name}_标签_50x30mm.png`;
        a.href = canvas.toDataURL("image/png");
        document.body.appendChild(a);
        a.click();
        a.remove();
      };
      img.src = dataUrl;
    })
    .catch(() => {
      ElMessage.error("生成标签失败");
    });
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

<style scoped>

.asset-page-card{
  border-radius: 18px;
}
.asset-toolbar{
  display:grid;
  grid-template-columns:minmax(0, 1fr) minmax(0, 1fr);
  gap:16px;
  margin-bottom:16px;
  align-items:start;
}
.toolbar-left,
.toolbar-right{
  min-width:0;
}
.toolbar-left{
  display:flex;
  flex-direction:column;
  gap:12px;
}
.toolbar-block{
  padding:14px 16px;
  border:1px solid #ebeef5;
  border-radius:16px;
  background: linear-gradient(180deg, #ffffff 0%, #fafcff 100%);
}
.toolbar-block-title{
  margin-bottom:10px;
  font-size:13px;
  font-weight:700;
  color:#606266;
}
.toolbar-row{
  display:flex;
  align-items:center;
  gap:12px;
  flex-wrap:nowrap;
  min-width:0;
}
.toolbar-row > *{
  min-width:0;
}
.toolbar-row.compact{
  justify-content:space-between;
}
.toolbar-select{
  width:120px;
  flex:0 1 120px;
}
.toolbar-input{
  flex:1 1 0;
  width:auto;
  min-width:0;
  max-width:100%;
}
.toolbar-actions-inline{
  display:flex;
  gap:12px;
  flex-wrap:nowrap;
  flex:0 0 auto;
}
.toolbar-actions-inline :deep(.el-button){
  min-width:88px;
  height:40px;
  padding-inline:18px;
}
.toolbar-hint{
  color:#909399;
  font-size:12px;
  line-height:1.4;
}
.toolbar-tool-row{
  display:grid;
  grid-template-columns:repeat(4, minmax(0, 1fr));
  gap:10px;
  align-items:stretch;
}
.toolbar-tool-row :deep(.el-button){
  margin-left:0;
  width:100%;
  min-width:0;
  height:40px;
}
.toolbar-tool-row :deep(.el-upload),
.toolbar-tool-row :deep(.el-upload .el-button){
  width:100%;
}
.toolbar-upload-inline{
  width:100%;
}
.toolbar-more-button{
  min-width:0 !important;
}
@media (max-width: 1100px){
  .asset-toolbar{
    grid-template-columns: 1fr;
  }
}
@media (max-width: 768px){
  .toolbar-block{
    padding:12px;
    border-radius:14px;
  }
  .toolbar-row{
    flex-wrap:wrap;
  }
  .toolbar-select,
  .toolbar-input,
  .toolbar-actions-inline,
  .toolbar-actions-inline :deep(.el-button),
  .toolbar-row.compact :deep(.el-upload),
  .toolbar-row.compact :deep(.el-upload .el-button){
    width:100%;
  }
  .toolbar-tool-row{
    grid-template-columns:repeat(2, minmax(0, 1fr));
  }
  .toolbar-row.compact{
    align-items:stretch;
  }
}

/* QR dialog polish */

/* === QR Dialog (polished) === */
:deep(.qr-dialog .el-dialog){
  border-radius: 16px;
}
:deep(.qr-dialog .el-dialog__header){
  padding: 16px 18px 10px 18px;
}
:deep(.qr-dialog .el-dialog__body){
  padding: 12px 18px 10px 18px;
}
:deep(.qr-dialog .el-dialog__footer){
  padding: 10px 18px 16px 18px;
}
.qr-header{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:12px;
  width:100%;
}
.qr-title{ display:flex; flex-direction:column; gap:2px; }
.qr-title-main{ font-weight:800; font-size:18px; line-height:1.2; }
.qr-title-sub{ color:#7a7a7a; font-size:12px; }

.qr-body{
  display:grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
}
.qr-left{ display:flex; flex-direction:column; gap:12px; align-items:center; }

.qr-card{
  width: 100%;
  padding: 14px 12px;
  border-radius: 16px;
  background: radial-gradient(600px 260px at 50% 0%, rgba(0,0,0,0.04), transparent 60%),
              linear-gradient(180deg, rgba(245,246,248,0.98), rgba(255,255,255,0.98));
  border: 1px solid rgba(0,0,0,0.06);
  box-shadow: 0 16px 34px rgba(0,0,0,0.10);
  display:flex;
  flex-direction:column;
  gap:12px;
  align-items:center;
}

.qr-box{
  width: 240px;
  height: 240px;
  border-radius: 14px;
  border: 1px solid rgba(0,0,0,0.06);
  background: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(245,246,248,0.95));
  display:flex;
  align-items:center;
  justify-content:center;
  overflow:hidden;
}
.qr-box img{
  width: 220px;
  height: 220px;
  display:block;
}
.qr-box-empty{ box-shadow:none; }
.qr-meta{
  width: 240px;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.06);
  background: rgba(255,255,255,0.75);
  padding: 10px 12px;
}
.qr-meta-line{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  line-height:1.6;
  font-size:12px;
}
.qr-meta-line .k{ color:#8a8a8a; }
.qr-meta-line .v{ color:#333; font-weight:600; max-width: 160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.qr-right{ display:flex; flex-direction:column; gap:12px; }

.qr-actions{ display:flex; flex-direction:column; gap:12px; }
.qr-action-group{
  border: 1px solid rgba(0,0,0,0.06);
  background: rgba(255,255,255,0.75);
  border-radius: 14px;
  padding: 12px;
}
.qr-action-title{ font-size: 12px; color: #777; margin-bottom: 10px; }
.qr-action-buttons{ display:flex; flex-wrap:wrap; gap:10px; }

.qr-link-label{ color:#777; font-size:12px; margin-bottom:6px; }
.qr-tip{ margin-top: 2px; }

.qr-footer{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  width:100%;
}
.qr-footnote{ color:#8a8a8a; font-size:12px; line-height:1.4; }

/* Responsive: phone */
@media (max-width: 640px){
  :deep(.qr-dialog .el-dialog){
    width: calc(100vw - 24px) !important;
    margin-top: 10vh;
  }
  .qr-body{ grid-template-columns: 1fr; }
  .qr-card{ width: 100%; }
  .qr-box{ width: 100%; height: auto; padding: 12px 0; }
  .qr-box img{ width: min(240px, 68vw); height: auto; }
  .qr-meta{ width: 100%; }
  .qr-footer{ flex-direction:column; align-items:flex-end; }
}

</style>
