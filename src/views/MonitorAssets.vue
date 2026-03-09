<template>
  <div>
    <el-card shadow="never" class="monitor-page-card mb12">
      <div class="monitor-toolbar">
        <div class="toolbar-left">
          <div class="toolbar-block toolbar-search">
            <div class="toolbar-block-title">筛选查询</div>
            <div class="toolbar-row">
              <el-select v-model="q.status" placeholder="状态" clearable class="toolbar-select" @change="reload()">
                <el-option label="在库" value="IN_STOCK" />
                <el-option label="已领用" value="ASSIGNED" />
                <el-option label="已回收" value="RECYCLED" />
                <el-option label="已报废" value="SCRAPPED" />
              </el-select>

              <el-select v-model="q.location_id" placeholder="位置" clearable filterable class="toolbar-location" @change="reload()">
                <el-option v-for="it in locationOptions" :key="it.value" :label="it.label" :value="it.value" />
              </el-select>

              <el-input v-model="q.keyword" placeholder="关键词：资产编号/SN/员工/型号" clearable class="toolbar-input" @keyup.enter="reload()" />

              <div class="toolbar-actions-inline">
                <el-button type="primary" @click="reload()">查询</el-button>
              </div>
            </div>
          </div>
        </div>

        <div class="toolbar-right">
          <div class="toolbar-block toolbar-tools">
            <div class="toolbar-block-title">快捷工具</div>
            <div class="toolbar-tool-grid">
              <el-button @click="exportExcel">导出Excel</el-button>
              <el-button @click="downloadMonitorTemplate">下载导入模板</el-button>
              <el-upload
                class="toolbar-upload"
                :show-file-list="false"
                :auto-upload="false"
                accept=".xlsx,.xls"
                :on-change="onImportMonitorFile"
              >
                <el-button type="primary">Excel导入</el-button>
              </el-upload>
              <el-button v-if="can('operator')" type="primary" plain @click="openCreate">新增台账</el-button>
              <el-button v-if="can('operator')" @click="openLocationMgr">管理位置</el-button>
              <el-button v-if="can('admin')" @click="initQrKeys">初始化二维码Key</el-button>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <el-card shadow="never">
      <el-table :data="rows" v-loading="loading" size="small" border>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="asset_code" label="资产编号" min-width="160" />
        <el-table-column prop="sn" label="SN" min-width="140" />
        <el-table-column label="型号" min-width="200">
          <template #default="{ row }">
            <span>{{ [row.brand, row.model].filter(Boolean).join(' ') }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="size_inch" label="尺寸" width="90" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">{{ statusText(row.status) }}</template>
        </el-table-column>
        <el-table-column label="位置" min-width="180">
          <template #default="{ row }">{{ locationText(row) }}</template>
        </el-table-column>
        <el-table-column label="领用人" min-width="180">
          <template #default="{ row }">
            <span v-if="row.employee_no || row.employee_name">{{ row.employee_name }}（{{ row.employee_no }}）</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="department" label="部门" min-width="140" />
        <el-table-column prop="updated_at" label="更新时间" min-width="170" />
        <el-table-column label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <div class="monitor-op-group">
              <el-button v-if="can('admin')" link type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button v-if="can('operator')" link @click="openQr(row)">二维码</el-button>
              <el-button v-if="can('operator')" link type="success" @click="openIn(row)">入库</el-button>
              <el-button v-if="can('operator')" link type="warning" @click="openOut(row)">出库</el-button>
              <el-button v-if="can('operator')" link type="info" @click="openReturn(row)">归还</el-button>
              <el-button v-if="can('operator')" link type="primary" @click="openTransfer(row)">调拨</el-button>
              <el-button v-if="can('admin')" link type="danger" @click="removeAsset(row)">删除</el-button>
            </div>
          </template>
        </el-table-column>
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

    <!-- create/edit -->
    <el-dialog v-model="dlgAsset.show" :title="dlgAsset.mode==='create' ? '新增显示器台账' : '编辑显示器台账'" width="520px">
      <el-form label-width="90px">
        <el-form-item label="资产编号">
          <el-input v-model="dlgAsset.form.asset_code" placeholder="必填" />
        </el-form-item>
        <el-form-item label="SN">
          <el-input v-model="dlgAsset.form.sn" placeholder="可选" />
        </el-form-item>
        <el-form-item label="品牌">
          <el-input v-model="dlgAsset.form.brand" />
        </el-form-item>
        <el-form-item label="型号">
          <el-input v-model="dlgAsset.form.model" />
        </el-form-item>
        <el-form-item label="尺寸">
          <el-input v-model="dlgAsset.form.size_inch" placeholder="例如 27" />
        </el-form-item>
        <el-form-item label="位置">
          <el-select v-model="dlgAsset.form.location_id" filterable clearable style="width:100%" placeholder="可选">
            <el-option v-for="it in locationOptions" :key="it.value" :label="it.label" :value="it.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="dlgAsset.form.remark" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgAsset.show=false">取消</el-button>
        <el-button type="primary" @click="saveAsset">保存</el-button>
      </template>
    </el-dialog>

    <!-- in/out/return/transfer dialogs -->
    <el-dialog v-model="dlgOp.show" :title="dlgOp.title" width="520px">
      <div style="margin-bottom:8px; color:#666">{{ dlgOp.asset?.asset_code }} {{ dlgOp.asset?.sn ? ' / ' + dlgOp.asset.sn : '' }}</div>
      <el-form label-width="90px">
        <template v-if="dlgOp.kind==='out'">
          <el-form-item label="工号"><el-input v-model="dlgOp.form.employee_no" /></el-form-item>
          <el-form-item label="姓名"><el-input v-model="dlgOp.form.employee_name" /></el-form-item>
          <el-form-item label="部门"><el-input v-model="dlgOp.form.department" /></el-form-item>
        </template>

        <el-form-item label="位置">
          <el-select v-model="dlgOp.form.location_id" filterable clearable style="width:100%" placeholder="可选/建议填写">
            <el-option v-for="it in locationOptions" :key="it.value" :label="it.label" :value="it.value" />
          </el-select>
        </el-form-item>

        <el-form-item label="备注">
          <el-input v-model="dlgOp.form.remark" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgOp.show=false">取消</el-button>
        <el-button type="primary" @click="submitOp">提交</el-button>
      </template>
    </el-dialog>

    <!-- QR dialog -->
    <el-dialog v-model="qrVisible" class="qr-dialog" width="560px" destroy-on-close :close-on-click-modal="false">
      <template #header>
        <div class="qr-header">
          <div class="qr-title">
            <span class="qr-title-main">扫码查看显示器信息</span>
            <span class="qr-title-sub">可控长期码 · 信息实时更新</span>
          </div>
          <el-tag size="small" type="info" effect="plain" v-if="qrRow">
            {{ [qrRow.brand, qrRow.model].filter(Boolean).join(' ') || '显示器' }}
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
              <div class="qr-meta-line"><span class="k">资产编号</span><span class="v">{{ qrRow.asset_code || '-' }}</span></div>
              <div class="qr-meta-line"><span class="k">SN</span><span class="v">{{ qrRow.sn || '-' }}</span></div>
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
              </div>
            </div>

            <div class="qr-action-group">
              <div class="qr-action-title">操作</div>
              <div class="qr-action-buttons">
                <el-button type="primary" :disabled="!qrLink" @click="openQrInNewTab">打开页面</el-button>
                <el-button v-if="can('admin')" type="danger" plain :disabled="!qrRow?.id" @click="resetQr">重置二维码</el-button>
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
            description="修改台账/出入库后，扫码会自动展示最新数据；管理员重置二维码后旧码立即失效。"
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

    <!-- location manager -->
    <el-dialog v-model="dlgLoc.show" title="位置管理" width="720px">
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:12px">
        <el-input v-model="dlgLoc.newName" placeholder="新增位置名称" style="width:260px" />
        <el-select v-model="dlgLoc.parentId" clearable filterable placeholder="父级(可选)" style="width:220px">
          <el-option v-for="it in locationParentOptions" :key="it.value" :label="it.label" :value="it.value" />
        </el-select>
        <el-button type="primary" @click="createLocation">新增</el-button>
      </div>

      <el-table :data="dlgLoc.rows" size="small" border>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column label="位置" min-width="260">
          <template #default="{ row }">
            {{ buildLocLabel(row) }}
          </template>
        </el-table-column>
        <el-table-column label="启用" width="100">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" :active-value="1" :inactive-value="0" @change="updateLocation(row)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button v-if="can('admin')" size="small" type="danger" plain @click="deleteLocation(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button @click="dlgLoc.show=false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { apiDelete, apiGet, apiPost, apiPut } from "../api/client";
import { exportToXlsx, parseXlsx, downloadTemplate } from "../utils/excel";
import { can } from "../store/auth";
import QRCode from "qrcode";

type Loc = { id: number; name: string; parent_id: number | null; enabled: number; created_at?: string };

const q = reactive({ status: "", location_id: "", keyword: "" });
const rows = ref<any[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(50);
const total = ref(0);

const locations = ref<Loc[]>([]);

function statusText(s: any) {
  const v = String(s || "");
  if (v === "IN_STOCK") return "在库";
  if (v === "ASSIGNED") return "已领用";
  if (v === "RECYCLED") return "已回收";
  if (v === "SCRAPPED") return "已报废";
  return v || "-";
}

function locationText(row: any) {
  const p = row.parent_location_name;
  const c = row.location_name;
  return [p, c].filter(Boolean).join("/") || "-";
}

const locationOptions = computed(() => {
  const mp = new Map<number, Loc>();
  for (const l of locations.value) mp.set(l.id, l);
  const label = (l: Loc) => {
    const p = l.parent_id ? mp.get(Number(l.parent_id)) : null;
    return [p?.name, l.name].filter(Boolean).join("/");
  };
  return locations.value
    .filter((x) => x.enabled === 1)
    .map((x) => ({ value: x.id, label: label(x) }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

const locationParentOptions = computed(() => {
  return locations.value
    .filter((x) => x.enabled === 1)
    .map((x) => ({ value: x.id, label: x.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

async function loadLocations() {
  try {
    const r = await apiGet<any>(`/api/pc-locations?enabled=1`);
    locations.value = (r.data || []) as Loc[];
  } catch (e: any) {
    await handleMaybeMissingSchema(e);
  }
}

async function handleMaybeMissingSchema(e: any) {
  const msg = String(e?.message || "");
  const missing = msg.includes("no such table: monitor_assets") || msg.includes("no such table: pc_locations") || msg.includes("no such table: monitor_tx");
  if (!missing) throw e;
  if (!can("admin")) {
    ElMessage.error("显示器模块数据库表尚未初始化，请联系管理员执行初始化");
    throw e;
  }

  await ElMessageBox.confirm(
    "检测到显示器模块数据库表尚未创建（monitor_assets/monitor_tx/pc_locations）。\n\n是否现在初始化？（仅需执行一次）",
    "需要初始化",
    { type: "warning", confirmButtonText: "初始化", cancelButtonText: "取消" }
  );

  await apiPost<any>("/api/monitor-init", { confirm: "初始化" });
  ElMessage.success("初始化完成，请重试操作");
}

async function loadList(opts?: { keepPage?: boolean }) {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    params.set("fast", "1");
    params.set("page", String(opts?.keepPage ? page.value : 1));
    params.set("page_size", String(pageSize.value));
    if (q.status) params.set("status", q.status);
    if (q.location_id) params.set("location_id", String(q.location_id));
    if (q.keyword) params.set("keyword", q.keyword);

    try {
      const r = await apiGet<any>(`/api/monitor-assets?${params.toString()}`);
      rows.value = r.data || [];
      if (!opts?.keepPage) page.value = 1;

      const c = await apiGet<any>(`/api/monitor-assets-count?${params.toString().replace("fast=1&", "")}`);
      total.value = Number(c.data?.total || 0);
    } catch (e: any) {
      await handleMaybeMissingSchema(e);
      const r2 = await apiGet<any>(`/api/monitor-assets?${params.toString()}`);
      rows.value = r2.data || [];
      const c2 = await apiGet<any>(`/api/monitor-assets-count?${params.toString().replace("fast=1&", "")}`);
      total.value = Number(c2.data?.total || 0);
    }
  } finally {
    loading.value = false;
  }
}

function reload() {
  loadList({ keepPage: false });
}

async function fetchAll() {
  const all: any[] = [];
  let p = 1;
  let totalLocal = 0;
  do {
    const params = new URLSearchParams();
    params.set("fast", "1");
    params.set("page", String(p));
    params.set("page_size", "200");
    if (q.status) params.set("status", q.status);
    if (q.location_id) params.set("location_id", String(q.location_id));
    if (q.keyword) params.set("keyword", q.keyword);
    const r = await apiGet<any>(`/api/monitor-assets?${params.toString()}`);
    const data = r.data || [];
    all.push(...data);
    const c = await apiGet<any>(`/api/monitor-assets-count?${params.toString().replace("fast=1&", "")}`);
    totalLocal = Number(c.data?.total || 0);
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
      filename: "显示器台账.xlsx",
      sheetName: "显示器台账",
      headers: [
        { key: "id", title: "ID" },
        { key: "asset_code", title: "资产编号" },
        { key: "sn", title: "SN" },
        { key: "brand", title: "品牌" },
        { key: "model", title: "型号" },
        { key: "size_inch", title: "尺寸" },
        { key: "status", title: "状态" },
        { key: "location_text", title: "位置" },
        { key: "employee_name", title: "领用人" },
        { key: "employee_no", title: "员工工号" },
        { key: "department", title: "部门" },
        { key: "remark", title: "备注" },
        { key: "updated_at", title: "更新时间" },
      ],
      rows: all.map((r:any) => ({
        ...r,
        status: statusText(r.status),
        location_text: [r.parent_location_name, r.location_name].filter(Boolean).join("/") || "-",
      })),
    });
  } catch (e:any) {
    ElMessage.error(e?.message || "导出失败");
  } finally {
    loading.value = false;
  }
}

function downloadMonitorTemplate() {
  downloadTemplate({
    filename: "显示器台账导入模板.xlsx",
    headers: [
      { title: "资产编号" },
      { title: "SN" },
      { title: "品牌" },
      { title: "型号" },
      { title: "尺寸" },
      { title: "位置" },
      { title: "备注" },
    ],
    exampleRows: [
      {
        "资产编号": "MON-001",
        "SN": "SN123456",
        "品牌": "Dell",
        "型号": "P2724H",
        "尺寸": "27",
        "位置": "总仓/办公区",
        "备注": "示例，可删除该行",
      },
    ],
  });
}

async function onImportMonitorFile(uploadFile: any) {
  const file: File = uploadFile?.raw;
  if (!file) return;
  try {
    const rows = await parseXlsx(file);
    if (!rows.length) {
      ElMessage.warning("Excel里没有可导入的数据");
      return;
    }

    const locMap = new Map<string, number>();
    locationOptions.value.forEach((x:any) => {
      locMap.set(String(x.label || "").trim(), Number(x.value));
      const tail = String(x.label || "").split("/").pop()?.trim();
      if (tail && !locMap.has(tail)) locMap.set(tail, Number(x.value));
    });

    let okSum = 0;
    let failSum = 0;
    const errors: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r:any = rows[i];
      const locationRaw = String(r["位置"] ?? r["location"] ?? "").trim();
      const payload = {
        asset_code: String(r["资产编号"] ?? r["asset_code"] ?? "").trim(),
        sn: String(r["SN"] ?? r["sn"] ?? "").trim(),
        brand: String(r["品牌"] ?? r["brand"] ?? "").trim(),
        model: String(r["型号"] ?? r["model"] ?? "").trim(),
        size_inch: String(r["尺寸"] ?? r["size_inch"] ?? "").trim(),
        location_id: locationRaw ? (locMap.get(locationRaw) || null) : null,
        remark: String(r["备注"] ?? r["remark"] ?? "").trim(),
      };
      if (!payload.asset_code) continue;
      try {
        await apiPost<any>(`/api/monitor-assets`, payload);
        okSum += 1;
      } catch (e:any) {
        failSum += 1;
        errors.push({ row: i + 2, msg: e?.message || "导入失败" });
      }
    }

    if (okSum === 0 && failSum === 0) {
      ElMessage.warning("Excel里没有可导入的数据");
      return;
    }
    if (failSum > 0) {
      console.warn("monitor-assets import errors", errors);
      ElMessage.warning(`导入完成：成功 ${okSum} 条，失败 ${failSum} 条（详情见控制台）`);
    } else {
      ElMessage.success(`导入完成：成功 ${okSum} 条`);
    }

    await loadList({ keepPage: false });
  } catch (e:any) {
    ElMessage.error(e?.message || "导入失败");
  }
}

function onPage(p: number) {
  page.value = p;
  loadList({ keepPage: true });
}
function onSize(s: number) {
  pageSize.value = s;
  reload();
}

// create/edit
const dlgAsset = reactive({
  show: false,
  mode: "create" as "create" | "edit",
  form: { id: 0, asset_code: "", sn: "", brand: "", model: "", size_inch: "", remark: "", location_id: "" as any },
});

function openCreate() {
  dlgAsset.mode = "create";
  dlgAsset.form = { id: 0, asset_code: "", sn: "", brand: "", model: "", size_inch: "", remark: "", location_id: "" as any };
  dlgAsset.show = true;
}
function openEdit(row: any) {
  dlgAsset.mode = "edit";
  dlgAsset.form = {
    id: row.id,
    asset_code: row.asset_code || "",
    sn: row.sn || "",
    brand: row.brand || "",
    model: row.model || "",
    size_inch: row.size_inch || "",
    remark: row.remark || "",
    location_id: row.location_id || "",
  } as any;
  dlgAsset.show = true;
}

async function saveAsset() {
  try {
    if (dlgAsset.mode === "create") {
      await apiPost<any>(`/api/monitor-assets`, dlgAsset.form);
      ElMessage.success("新增成功");
    } else {
      await apiPut<any>(`/api/monitor-assets`, dlgAsset.form);
      ElMessage.success("保存成功");
    }
    dlgAsset.show = false;
    await loadList({ keepPage: true });
  } catch (e: any) {
    try {
      await handleMaybeMissingSchema(e);
      if (dlgAsset.mode === "create") {
        await apiPost<any>(`/api/monitor-assets`, dlgAsset.form);
        ElMessage.success("新增成功");
      } else {
        await apiPut<any>(`/api/monitor-assets`, dlgAsset.form);
        ElMessage.success("保存成功");
      }
      dlgAsset.show = false;
      await loadList({ keepPage: true });
    } catch (e2: any) {
      ElMessage.error(e2.message || "操作失败");
    }
  }
}

async function removeAsset(row: any) {
  try {
    await ElMessageBox.confirm(`确认删除显示器台账：${[row.brand, row.model].filter(Boolean).join(' ')}（资产编号: ${row.asset_code || '-'}）？`, "删除确认", {
      type: "warning",
      confirmButtonText: "确认删除",
      cancelButtonText: "取消",
    });
    loading.value = true;
    await apiDelete<any>(`/api/monitor-assets`, { id: row.id });
    ElMessage.success("删除成功");
    if (rows.value.length === 1 && page.value > 1) page.value -= 1;
    await loadList({ keepPage: true });
  } catch (e: any) {
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e?.message || "删除失败");
  } finally {
    loading.value = false;
  }
}

// operations
const dlgOp = reactive({
  show: false,
  kind: "in" as "in" | "out" | "return" | "transfer",
  title: "",
  asset: null as any,
  form: { location_id: "" as any, employee_no: "", employee_name: "", department: "", remark: "" },
});

function openIn(row: any) {
  dlgOp.kind = "in";
  dlgOp.title = "显示器入库";
  dlgOp.asset = row;
  dlgOp.form = { location_id: row.location_id || "", employee_no: "", employee_name: "", department: "", remark: "" };
  dlgOp.show = true;
}
function openOut(row: any) {
  dlgOp.kind = "out";
  dlgOp.title = "显示器出库（领用）";
  dlgOp.asset = row;
  dlgOp.form = { location_id: row.location_id || "", employee_no: "", employee_name: "", department: "", remark: "" };
  dlgOp.show = true;
}
function openReturn(row: any) {
  dlgOp.kind = "return";
  dlgOp.title = "显示器归还";
  dlgOp.asset = row;
  dlgOp.form = { location_id: row.location_id || "", employee_no: "", employee_name: "", department: "", remark: "" };
  dlgOp.show = true;
}
function openTransfer(row: any) {
  dlgOp.kind = "transfer";
  dlgOp.title = "显示器调拨";
  dlgOp.asset = row;
  dlgOp.form = { location_id: row.location_id || "", employee_no: "", employee_name: "", department: "", remark: "" };
  dlgOp.show = true;
}

async function submitOp() {
  const a = dlgOp.asset;
  if (!a) return;
  try {
    if (dlgOp.kind === "in") {
      await apiPost<any>(`/api/monitor-in`, { asset_id: a.id, location_id: dlgOp.form.location_id || null, remark: dlgOp.form.remark });
      ElMessage.success("入库成功");
    } else if (dlgOp.kind === "out") {
      await apiPost<any>(`/api/monitor-out`, {
        asset_id: a.id,
        location_id: dlgOp.form.location_id || null,
        employee_no: dlgOp.form.employee_no,
        employee_name: dlgOp.form.employee_name,
        department: dlgOp.form.department,
        remark: dlgOp.form.remark,
      });
      ElMessage.success("出库成功");
    } else if (dlgOp.kind === "return") {
      await apiPost<any>(`/api/monitor-return`, { asset_id: a.id, location_id: dlgOp.form.location_id || null, remark: dlgOp.form.remark });
      ElMessage.success("归还成功");
    } else if (dlgOp.kind === "transfer") {
      await apiPost<any>(`/api/monitor-transfer`, { asset_id: a.id, to_location_id: dlgOp.form.location_id, remark: dlgOp.form.remark });
      ElMessage.success("调拨成功");
    }
    dlgOp.show = false;
    await loadList({ keepPage: true });
  } catch (e: any) {
    ElMessage.error(e?.message || "操作失败");
  }
}

// QR
const qrVisible = ref(false);
const qrLoading = ref(false);
const qrRow = ref<any>(null);
const qrLink = ref("");
const qrDataUrl = ref("");

async function openQr(row: any) {
  qrVisible.value = true;
  qrRow.value = { ...row };
  qrLink.value = "";
  qrDataUrl.value = "";
  qrLoading.value = true;
  try {
    // apiGet() does not accept a params object; build query string explicitly.
    const rid = Number(row?.id || 0);
    if (!rid) throw new Error("缺少资产ID");
    const r = await apiGet<any>("/api/monitor-asset-qr-token?id=" + encodeURIComponent(String(rid)));
    const link = String(r?.url || "");
    qrLink.value = link;
    if (link) qrDataUrl.value = await QRCode.toDataURL(link, { margin: 1, width: 360 });
  } catch (e: any) {
    ElMessage.error(e?.message || "生成二维码失败");
  } finally {
    qrLoading.value = false;
  }
}

function downloadQr() {
  if (!qrDataUrl.value) return;
  const a = document.createElement("a");
  a.href = qrDataUrl.value;
  const code = qrRow.value?.asset_code || "monitor";
  a.download = `显示器二维码_${code}.png`;
  a.click();
}

async function copyQrLink() {
  try {
    await navigator.clipboard.writeText(qrLink.value || "");
    ElMessage.success("已复制");
  } catch {
    ElMessage.warning("复制失败，请手动复制");
  }
}

function openQrInNewTab() {
  if (!qrLink.value) return;
  window.open(qrLink.value, "_blank");
}

async function resetQr() {
  try {
    const id = Number(qrRow.value?.id || 0);
    if (!id) return;
    await ElMessageBox.confirm("重置后旧二维码将立即失效，确认继续？", "重置二维码", {
      type: "warning",
      confirmButtonText: "重置",
      cancelButtonText: "取消",
    });
    qrLoading.value = true;
    const r = await apiPost<any>(`/api/monitor-assets-reset-qr?id=${id}`, {});
    const link = String(r?.url || "");
    qrLink.value = link;
    if (link) qrDataUrl.value = await QRCode.toDataURL(link, { margin: 1, width: 360 });
    ElMessage.success("已重置");
  } catch (e: any) {
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e?.message || "重置失败");
  } finally {
    qrLoading.value = false;
  }
}

async function initQrKeys() {
  try {
    await ElMessageBox.confirm("将为所有缺少二维码Key的显示器批量生成Key（分批执行）。继续？", "初始化二维码Key", {
      type: "warning",
      confirmButtonText: "继续",
      cancelButtonText: "取消",
    });
    let totalUpdated = 0;
    // loop a few batches
    for (let i = 0; i < 20; i++) {
      const r = await apiPost<any>("/api/monitor-assets-init-qr-keys", { batch_size: 50 });
      const updated = Number(r?.updated || 0);
      totalUpdated += updated;
      if (updated <= 0) break;
    }
    ElMessage.success(totalUpdated ? `已补齐 ${totalUpdated} 条` : "无需补齐（都已存在）");
  } catch (e: any) {
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e?.message || "初始化失败");
  }
}

// locations manager
const dlgLoc = reactive({ show: false, rows: [] as any[], newName: "", parentId: "" as any });

function buildLocLabel(row: any) {
  const p = locations.value.find((x) => x.id === row.parent_id);
  return [p?.name, row.name].filter(Boolean).join("/");
}

async function openLocationMgr() {
  dlgLoc.show = true;
  await refreshLocationMgr();
}

async function refreshLocationMgr() {
  const r = await apiGet<any>(`/api/pc-locations`);
  dlgLoc.rows = (r.data || []).map((x: any) => ({ ...x }));
  locations.value = dlgLoc.rows as any;
}

async function createLocation() {
  try {
    if (!dlgLoc.newName.trim()) return ElMessage.warning("请输入位置名称");
    await apiPost<any>(`/api/pc-locations`, { name: dlgLoc.newName.trim(), parent_id: dlgLoc.parentId || null });
    dlgLoc.newName = "";
    dlgLoc.parentId = "";
    await refreshLocationMgr();
    ElMessage.success("新增成功");
  } catch (e: any) {
    ElMessage.error(e.message || "新增失败");
  }
}

async function updateLocation(row: any) {
  try {
    await apiPut<any>(`/api/pc-locations`, { id: row.id, name: row.name, parent_id: row.parent_id, enabled: row.enabled });
    await refreshLocationMgr();
    ElMessage.success("保存成功");
  } catch (e: any) {
    ElMessage.error(e.message || "保存失败");
  }
}

async function deleteLocation(row: any) {
  try {
    await ElMessageBox.confirm("删除位置后无法恢复，确认继续？", "提示", { type: "warning" });
    await apiDelete<any>(`/api/pc-locations`, { id: row.id, confirm: "删除" });
    await refreshLocationMgr();
    ElMessage.success("删除成功");
  } catch (e: any) {
    if (e?.message) ElMessage.error(e.message);
  }
}

onMounted(async () => {
  await loadLocations();
  await loadList();
});
</script>

<style scoped>
.mb12 { margin-bottom: 12px; }
.monitor-page-card{ border-radius: 18px; }
.monitor-toolbar{ display:grid; grid-template-columns:minmax(0,1.5fr) minmax(340px,1fr); gap:16px; }
.toolbar-left,.toolbar-right{ min-width:0; }
.toolbar-block{ padding:14px 16px; border:1px solid #ebeef5; border-radius:16px; background:linear-gradient(180deg,#ffffff 0%,#fafcff 100%); }
.toolbar-block-title{ margin-bottom:10px; font-size:13px; font-weight:700; color:#606266; }
.toolbar-row{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.toolbar-select{ width:160px; }
.toolbar-location{ width:220px; }
.toolbar-input{ width:300px; max-width:100%; }
.toolbar-actions-inline{ display:flex; gap:12px; flex-wrap:wrap; }
.toolbar-tool-grid{ display:grid; grid-template-columns:repeat(auto-fit, minmax(140px,1fr)); gap:10px; }
.toolbar-tool-grid :deep(.el-button){ width:100%; margin-left:0; }
.toolbar-tool-grid :deep(.el-upload), .toolbar-tool-grid :deep(.el-upload .el-button){ width:100%; }
.monitor-op-group{ display:flex; flex-wrap:wrap; align-items:center; gap:4px 12px; }
.monitor-op-group :deep(.el-button){ margin-left:0; padding:4px 0; height:auto; font-weight:600; }
@media (max-width: 1100px){ .monitor-toolbar{ grid-template-columns:1fr; } }
@media (max-width: 768px){ .toolbar-block{ padding:12px; border-radius:14px; } .toolbar-select,.toolbar-location,.toolbar-input,.toolbar-actions-inline,.toolbar-actions-inline :deep(.el-button){ width:100%; } }

.qr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.qr-title { display: flex; flex-direction: column; gap: 2px; }
.qr-title-main { font-weight: 700; }
.qr-title-sub { font-size: 12px; color: #888; }

.qr-body { display: flex; gap: 12px; }
.qr-left { width: 260px; }
.qr-right { flex: 1; }
.qr-card { border: 1px solid #eee; border-radius: 10px; padding: 12px; }
.qr-box { width: 220px; height: 220px; display:flex; align-items:center; justify-content:center; margin: 0 auto; }
.qr-box img { width: 100%; height: 100%; object-fit: contain; }
.qr-box-empty { background: #fafafa; border-radius: 8px; }
.qr-meta { margin-top: 10px; font-size: 12px; color: #666; display:flex; flex-direction:column; gap: 6px; }
.qr-meta-line { display:flex; gap: 8px; }
.qr-meta-line .k { width: 62px; color: #999; }
.qr-meta-line .v { flex: 1; }

.qr-actions { display:flex; flex-direction:column; gap: 12px; }
.qr-action-group { border: 1px solid #eee; border-radius: 10px; padding: 12px; }
.qr-action-title { font-weight: 600; margin-bottom: 8px; }
.qr-action-buttons { display:flex; gap: 10px; flex-wrap:wrap; }

.qr-link { margin-top: 12px; }
.qr-link-label { font-size: 12px; color: #888; margin-bottom: 6px; }
.qr-tip { margin-top: 12px; }

.qr-footer { display:flex; align-items:center; justify-content:space-between; gap: 10px; }
.qr-footnote { font-size: 12px; color: #888; }
</style>
