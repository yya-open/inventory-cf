<template>
  <div>
    <el-card shadow="never" class="mb12">
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center">
        <el-select v-model="q.status" placeholder="状态" clearable style="width:140px" @change="reload()">
          <el-option label="在库" value="IN_STOCK" />
          <el-option label="已领用" value="ASSIGNED" />
          <el-option label="已回收" value="RECYCLED" />
          <el-option label="已报废" value="SCRAPPED" />
        </el-select>

        <el-select v-model="q.location_id" placeholder="位置" clearable filterable style="width:220px" @change="reload()">
          <el-option v-for="it in locationOptions" :key="it.value" :label="it.label" :value="it.value" />
        </el-select>

        <el-input v-model="q.keyword" placeholder="关键词：资产编号/SN/员工/型号" clearable style="width:260px" @keyup.enter="reload()" />

        <el-button @click="reload()">查询</el-button>
        <el-button v-if="can('operator')" type="primary" @click="openCreate">新增台账</el-button>
        <el-button v-if="can('operator')" @click="openLocationMgr">管理位置</el-button>
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
        <el-table-column label="操作" width="360" fixed="right">
          <template #default="{ row }">
            <el-button v-if="can('admin')" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="can('operator')" size="small" @click="openIn(row)">入库</el-button>
            <el-button v-if="can('operator')" size="small" @click="openOut(row)">出库</el-button>
            <el-button v-if="can('operator')" size="small" @click="openReturn(row)">归还</el-button>
            <el-button v-if="can('operator')" size="small" @click="openTransfer(row)">调拨</el-button>
            <el-button v-if="can('operator')" size="small" type="danger" plain @click="openScrap(row)">报废</el-button>
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

    <!-- in/out/return/transfer/scrap dialogs -->
    <el-dialog v-model="dlgOp.show" :title="dlgOp.title" width="520px">
      <div style="margin-bottom:8px; color:#666">{{ dlgOp.asset?.asset_code }} {{ dlgOp.asset?.sn ? ' / ' + dlgOp.asset.sn : '' }}</div>
      <el-form label-width="90px">
        <template v-if="dlgOp.kind==='out'">
          <el-form-item label="工号"><el-input v-model="dlgOp.form.employee_no" /></el-form-item>
          <el-form-item label="姓名"><el-input v-model="dlgOp.form.employee_name" /></el-form-item>
          <el-form-item label="部门"><el-input v-model="dlgOp.form.department" /></el-form-item>
        </template>

        <template v-if="dlgOp.kind!=='scrap'">
          <el-form-item label="位置">
            <el-select v-model="dlgOp.form.location_id" filterable clearable style="width:100%" placeholder="可选/建议填写">
              <el-option v-for="it in locationOptions" :key="it.value" :label="it.label" :value="it.value" />
            </el-select>
          </el-form-item>
        </template>

        <el-form-item :label="dlgOp.kind==='scrap' ? '原因' : '备注'">
          <el-input v-model="dlgOp.form.remark" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgOp.show=false">取消</el-button>
        <el-button type="primary" @click="submitOp">提交</el-button>
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
import { can } from "../store/auth";

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
    // If schema not initialized yet, pc_locations may not exist.
    await handleMaybeMissingSchema(e);
  }
}

async function handleMaybeMissingSchema(e: any) {
  const msg = String(e?.message || '');
  const missing = msg.includes('no such table: monitor_assets') || msg.includes('no such table: pc_locations') || msg.includes('no such table: monitor_tx');
  if (!missing) throw e;
  if (!can('admin')) {
    ElMessage.error('显示器模块数据库表尚未初始化，请联系管理员执行初始化');
    throw e;
  }

  await ElMessageBox.confirm(
    '检测到显示器模块数据库表尚未创建（monitor_assets/monitor_tx/pc_locations）。\n\n是否现在初始化？（仅需执行一次）',
    '需要初始化',
    { type: 'warning', confirmButtonText: '初始化', cancelButtonText: '取消' }
  );

  await apiPost<any>('/api/monitor-init', { confirm: '初始化' });
  ElMessage.success('初始化完成，请重试操作');
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

      // async total
      const c = await apiGet<any>(`/api/monitor-assets-count?${params.toString().replace('fast=1&', '')}`);
      total.value = Number(c.data?.total || 0);
    } catch (e: any) {
      await handleMaybeMissingSchema(e);
      // retry once after init
      const r2 = await apiGet<any>(`/api/monitor-assets?${params.toString()}`);
      rows.value = r2.data || [];
      const c2 = await apiGet<any>(`/api/monitor-assets-count?${params.toString().replace('fast=1&', '')}`);
      total.value = Number(c2.data?.total || 0);
    }
  } finally {
    loading.value = false;
  }
}

function reload() {
  loadList({ keepPage: false });
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
      // retry once after init
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

// operations
const dlgOp = reactive({
  show: false,
  kind: "in" as "in" | "out" | "return" | "transfer" | "scrap",
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
function openScrap(row: any) {
  dlgOp.kind = "scrap";
  dlgOp.title = "显示器报废";
  dlgOp.asset = row;
  dlgOp.form = { location_id: "", employee_no: "", employee_name: "", department: "", remark: "" };
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
    } else if (dlgOp.kind === "scrap") {
      await apiPost<any>(`/api/monitor-scrap`, { asset_id: a.id, reason: dlgOp.form.remark || "报废" });
      ElMessage.success("报废成功");
    }
    dlgOp.show = false;
    await loadList({ keepPage: true });
  } catch (e: any) {
    try {
      await handleMaybeMissingSchema(e);
      // retry once after init
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
</style>
