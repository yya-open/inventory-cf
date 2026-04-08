<template>
  <el-card>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px">
      <div>
        <span style="font-weight:700">用户管理</span>
        <span style="margin-left:10px; color:#999; font-size:12px">管理员可创建账号、分配权限、禁用账号、重置密码，并配置数据可见范围</span>
      </div>
      <el-button type="primary" @click="openCreate">新增用户</el-button>
    </div>

    <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:12px">
      <el-input v-model="keyword" clearable style="width:240px" placeholder="搜索：账号" @keyup.enter="reload" />
      <el-select v-model="sortBy" style="width:170px" @change="reload">
        <el-option label="账号" value="username" />
        <el-option label="角色" value="role" />
        <el-option label="状态" value="is_active" />
        <el-option label="创建时间" value="created_at" />
      </el-select>
      <el-select v-model="sortDir" style="width:120px" @change="reload">
        <el-option label="升序" value="asc" />
        <el-option label="降序" value="desc" />
      </el-select>
      <el-button type="primary" plain @click="reload">查询</el-button>
      <el-button @click="resetSearch">重置</el-button>
      <el-tag v-if="total" type="info" style="margin-left:auto">共 {{ total }} 条</el-tag>
    </div>

    <el-table v-loading="loading" :data="rows" border>
      <el-table-column label="#" width="70">
        <template #default="{ $index }">{{ (page - 1) * pageSize + $index + 1 }}</template>
      </el-table-column>
      <el-table-column prop="username" label="账号" width="160" />
      <el-table-column prop="role" label="角色" width="140">
        <template #default="{ row }">
          <el-tag :type="row.role==='admin'?'danger':row.role==='operator'?'warning':'info'">{{ roleText(row.role) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="is_active" label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="row.is_active? 'success':'info'">{{ row.is_active ? '启用' : '禁用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="可见范围" min-width="180">
        <template #default="{ row }">
          <el-tag :type="row.data_scope_type && row.data_scope_type !== 'all' ? 'warning' : 'success'">{{ dataScopeLabel(row.data_scope_type, row.data_scope_value, row.data_scope_value2) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="must_change_password" label="需改密码" width="110">
        <template #default="{ row }">
          <el-tag :type="row.must_change_password? 'warning':'success'">{{ row.must_change_password ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" min-width="170">
        <template #default="{ row }">{{ formatBeijingDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" min-width="260">
        <template #default="{ row }">
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            <el-button size="small" @click="openEdit(row)">权限/状态</el-button>
            <el-button size="small" type="warning" plain @click="openReset(row)">重置密码</el-button>
            <el-button v-if="auth.user?.role==='admin'" size="small" type="danger" plain :disabled="row.id===auth.user?.id" @click="delUser(row)">删除</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="total" style="display:flex; justify-content:flex-end; margin-top:12px">
      <el-pagination background layout="total, sizes, prev, pager, next, jumper" :total="total" :page-size="pageSize" :current-page="page" :page-sizes="[20,50,100,200]" @current-change="(p:number)=>{ page=p; load(); }" @size-change="(s:number)=>{ pageSize=s; page=1; load(); }" />
    </div>

    <el-dialog v-model="showCreate" title="新增用户" width="520px">
      <el-form label-width="100px">
        <el-form-item label="账号"><el-input v-model="form.username" /></el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password />
          <div style="color:#999; font-size:12px; margin-top:6px">密码长度需为 6-64 位，且必须同时包含字母和数字</div>
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width:100%">
            <el-option label="管理员" value="admin" />
            <el-option label="操作员" value="operator" />
            <el-option label="只读" value="viewer" />
          </el-select>
        </el-form-item>
        <el-form-item label="数据范围">
          <div style="display:flex; gap:8px; width:100%">
            <el-select v-model="form.data_scope_type" style="flex:1">
            <el-option v-for="item in DATA_SCOPE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <el-button @click="previewCreateScope">预览范围</el-button>
          </div>
        </el-form-item>
        <el-form-item v-if="form.data_scope_type === 'department' || form.data_scope_type === 'department_warehouse'" label="部门">
          <el-input v-model="form.data_scope_value" clearable placeholder="请输入部门" />
        </el-form-item>
        <el-form-item v-if="form.data_scope_type === 'warehouse' || form.data_scope_type === 'department_warehouse'" label="仓库">
          <el-select v-model="createWarehouseScopeValue" filterable clearable style="width:100%" placeholder="请选择仓库">
            <el-option v-for="item in warehouseOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="权限模板">
          <div style="display:flex; gap:8px; width:100%">
            <el-select v-model="form.permission_template_code" style="flex:1">
              <el-option v-for="item in permissionTemplateOptions" :key="item.code" :label="item.label" :value="item.code" />
            </el-select>
            <el-button @click="applyCreateTemplate">套用</el-button>
          </div>
        </el-form-item>
        <el-form-item label="细分权限">
          <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; width:100%">
            <el-checkbox v-for="code in ALL_PERMISSION_CODES" :key="code" :model-value="!!form.permissions[code]" @change="(v:any)=>form.permissions[code]=!!v">{{ PERMISSION_LABEL[code] }}</el-checkbox>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="createUser">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showEdit" title="权限/状态" width="520px">
      <el-form label-width="100px">
        <el-form-item label="账号"><el-input :model-value="editing?.username" disabled /></el-form-item>
        <el-form-item label="角色">
          <el-select v-model="editRole" style="width:100%">
            <el-option label="管理员" value="admin" />
            <el-option label="操作员" value="operator" />
            <el-option label="只读" value="viewer" />
          </el-select>
        </el-form-item>
        <el-form-item label="数据范围">
          <div style="display:flex; gap:8px; width:100%">
            <el-select v-model="editDataScopeType" style="flex:1">
            <el-option v-for="item in DATA_SCOPE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <el-button @click="previewEditScope">预览范围</el-button>
          </div>
        </el-form-item>
        <el-form-item v-if="editDataScopeType === 'department' || editDataScopeType === 'department_warehouse'" label="部门">
          <el-input v-model="editDataScopeValue" clearable placeholder="请输入部门" />
        </el-form-item>
        <el-form-item v-if="editDataScopeType === 'warehouse' || editDataScopeType === 'department_warehouse'" label="仓库">
          <el-select v-model="editWarehouseScopeValue" filterable clearable style="width:100%" placeholder="请选择仓库">
            <el-option v-for="item in warehouseOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="权限模板">
          <div style="display:flex; gap:8px; width:100%">
            <el-select v-model="editTemplateCode" style="flex:1">
              <el-option v-for="item in permissionTemplateOptions" :key="item.code" :label="item.label" :value="item.code" />
            </el-select>
            <el-button @click="applyEditTemplate">套用</el-button>
          </div>
        </el-form-item>
        <el-form-item label="状态"><el-switch v-model="editActive" active-text="启用" inactive-text="禁用" /></el-form-item>
        <el-form-item label="细分权限">
          <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; width:100%">
            <el-checkbox v-for="code in ALL_PERMISSION_CODES" :key="code" :model-value="!!editPermissions[code]" @change="(v:any)=>editPermissions[code]=!!v">{{ PERMISSION_LABEL[code] }}</el-checkbox>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>


    <el-dialog v-model="showScopePreview" title="数据可见范围预览" width="680px">
      <div v-if="scopePreview" style="display:flex; flex-direction:column; gap:12px">
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          <el-tag type="warning">{{ scopePreview.scope_label }}</el-tag>
          <el-tag v-for="item in scopePreview.route_meta?.report_modes || []" :key="item.value" type="success">看板：{{ item.label }}</el-tag>
        </div>
        <el-alert type="info" :closable="false" show-icon>
          <template #default>
            <div v-for="tip in scopePreview.tips || []" :key="tip">{{ tip }}</div>
          </template>
        </el-alert>
        <el-card shadow="never">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap">
            <div style="font-weight:700">权限策略测试器</div>
            <el-select v-model="previewTargetPath" style="min-width:280px; flex:1" placeholder="请选择要测试的入口">
              <el-option v-for="item in scopePreview.route_checks || []" :key="item.path" :label="item.label" :value="item.path" />
            </el-select>
            <el-tag v-if="previewRouteResult" :type="previewRouteResult.enabled ? 'success' : 'danger'">{{ previewRouteResult.enabled ? '允许访问' : '将被拦截' }}</el-tag>
          </div>
          <div style="margin-top:8px; color:#666">{{ previewRouteResult?.reason || '请选择一个入口查看策略结果' }}</div>
        </el-card>
        <el-row :gutter="12">
          <el-col :span="8"><el-card shadow="never"><div style="color:#999">电脑台账</div><div style="font-size:26px; font-weight:700">{{ scopePreview.counts?.pc_assets ?? 0 }}</div></el-card></el-col>
          <el-col :span="8"><el-card shadow="never"><div style="color:#999">显示器台账</div><div style="font-size:26px; font-weight:700">{{ scopePreview.counts?.monitor_assets ?? 0 }}</div></el-card></el-col>
          <el-col :span="8"><el-card shadow="never"><div style="color:#999">配件条目</div><div style="font-size:26px; font-weight:700">{{ scopePreview.counts?.parts_items ?? 0 }}</div></el-card></el-col>
        </el-row>
        <el-table :data="scopePreview.routes || []" border>
          <el-table-column prop="label" label="模块" min-width="180" />
          <el-table-column label="是否可见" width="110">
            <template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '可见' : '不可见' }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="reason" label="说明" min-width="220" />
        </el-table>
        <el-table :data="scopePreview.route_checks || []" border>
          <el-table-column prop="label" label="入口" min-width="220" />
          <el-table-column label="策略结果" width="120">
            <template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '允许' : '拦截' }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="reason" label="命中规则" min-width="260" />
        </el-table>
      </div>
      <div v-else style="color:#999">暂无预览数据</div>
      <template #footer>
        <el-button @click="showScopePreview=false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showReset" title="重置密码" width="460px">
      <div style="color:#666; margin-bottom:10px">将为账号 <b>{{ editing?.username }}</b> 设置新密码，并要求下次登录修改。</div>
      <el-form label-width="90px">
        <el-form-item label="新密码">
          <el-input v-model="resetPwd" type="password" show-password />
          <div style="color:#999; font-size:12px; margin-top:6px">密码长度需为 6-64 位，且必须同时包含字母和数字</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showReset=false">取消</el-button>
        <el-button type="warning" :loading="saving" @click="doReset">确认重置</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useAuth } from "../store/auth";
import { formatBeijingDateTime } from "../utils/datetime";
import { ElMessage, ElMessageBox } from "../utils/el-services";
import { apiGet, apiPost, apiPut, apiDelete } from "../api/client";
import { validatePassword } from "../utils/password";
import { ALL_PERMISSION_CODES, ALL_PERMISSION_TEMPLATE_CODES, PERMISSION_LABEL, PERMISSION_TEMPLATE_LABEL, buildTemplatePermissionMap, getDefaultPermissionTemplate, normalizePermissionTemplateCode, type PermissionTemplateCode } from "../utils/permissions";
import { DATA_SCOPE_OPTIONS, dataScopeLabel, normalizeDataScope } from "../utils/dataScope";
import { DEFAULT_SYSTEM_SETTINGS, fetchSystemSettings, getCachedSystemSettings } from "../api/systemSettings";

type Row = { id:number; username:string; role:"admin"|"operator"|"viewer"; is_active:number; must_change_password:number; created_at:string; permission_template_code?: string | null; permissions?: Record<string, boolean>; data_scope_type?: 'all' | 'department' | 'warehouse' | 'department_warehouse'; data_scope_value?: string | null; data_scope_value2?: string | null };

const rows = ref<Row[]>([]);
const loading = ref(false);
const saving = ref(false);

const keyword = ref("");
const page = ref(1);
const pageSize = ref(50);
const total = ref(0);
const sortBy = ref("created_at");
const sortDir = ref<"asc"|"desc">("desc");

const auth = useAuth();
const permissionTemplateOptions = ALL_PERMISSION_TEMPLATE_CODES.map((code) => ({ code, label: PERMISSION_TEMPLATE_LABEL[code] }));

const showCreate = ref(false);
const showEdit = ref(false);
const showReset = ref(false);
const showScopePreview = ref(false);
const scopePreview = ref<any | null>(null);
const previewTargetPath = ref('');
const previewRouteResult = computed(() => (scopePreview.value?.route_checks || []).find((item:any) => item.path === previewTargetPath.value) || null);

const systemSettings = ref({ ...DEFAULT_SYSTEM_SETTINGS });
const warehouseOptions = computed(() => systemSettings.value.dictionary_asset_warehouse_options || []);
const createWarehouseScopeValue = computed({
  get: () => form.value.data_scope_type === 'warehouse' ? form.value.data_scope_value : form.value.data_scope_value2,
  set: (value: string) => {
    if (form.value.data_scope_type === 'warehouse') form.value.data_scope_value = value || '';
    else form.value.data_scope_value2 = value || '';
  },
});

const editWarehouseScopeValue = computed({
  get: () => editDataScopeType.value === 'warehouse' ? editDataScopeValue.value : editDataScopeValue2.value,
  set: (value: string) => {
    if (editDataScopeType.value === 'warehouse') editDataScopeValue.value = value || '';
    else editDataScopeValue2.value = value || '';
  },
});
const form = ref({ username:"", password:"", role:"viewer" as any, permission_template_code: getDefaultPermissionTemplate("viewer") as PermissionTemplateCode, permissions: {} as Record<string, boolean>, data_scope_type: 'all' as 'all' | 'department' | 'warehouse' | 'department_warehouse', data_scope_value: '', data_scope_value2: '' });

const editing = ref<Row|null>(null);
const editRole = ref<"admin"|"operator"|"viewer">("viewer");
const editActive = ref(true);
const editPermissions = ref<Record<string, boolean>>({});
const editTemplateCode = ref<PermissionTemplateCode>(getDefaultPermissionTemplate("viewer"));
const editDataScopeType = ref<'all' | 'department' | 'warehouse' | 'department_warehouse'>('all');
const editDataScopeValue = ref('');
const editDataScopeValue2 = ref('');
const resetPwd = ref("");

watch(() => form.value.data_scope_type, (type) => {
  if (type === 'all') {
    form.value.data_scope_value = '';
    form.value.data_scope_value2 = '';
    return;
  }
  if (type === 'department') form.value.data_scope_value2 = '';
  if (type === 'warehouse') {
    form.value.data_scope_value = form.value.data_scope_value || form.value.data_scope_value2 || '';
    form.value.data_scope_value2 = '';
  }
});

watch(editDataScopeType, (type) => {
  if (type === 'all') {
    editDataScopeValue.value = '';
    editDataScopeValue2.value = '';
    return;
  }
  if (type === 'department') editDataScopeValue2.value = '';
  if (type === 'warehouse') {
    editDataScopeValue.value = editDataScopeValue.value || editDataScopeValue2.value || '';
    editDataScopeValue2.value = '';
  }
});

function roleText(r: string) {
  return r==="admin" ? "管理员" : r==="operator" ? "操作员" : "只读";
}

async function load() {
  loading.value = true;
  try {
    const qs = new URLSearchParams();
    qs.set("page", String(page.value));
    qs.set("page_size", String(pageSize.value));
    qs.set("sort_by", String(sortBy.value || "created_at"));
    qs.set("sort_dir", String(sortDir.value || "desc"));
    if (keyword.value.trim()) qs.set("keyword", keyword.value.trim());
    qs.set("_ts", String(Date.now()));
    const r = await apiGet<{ ok:boolean; data: Row[]; meta?: { total?: number } }>("/api/users?" + qs.toString(), { cache: "no-store" });
    rows.value = r.data || [];
    total.value = Number((r as any).meta?.total || 0);
  } catch (e:any) {
    ElMessage.error(e.message || "加载失败");
  } finally {
    loading.value = false;
  }
}

function reload() {
  page.value = 1;
  load();
}

function resetSearch() {
  keyword.value = "";
  sortBy.value = "created_at";
  sortDir.value = "desc";
  reload();
}


function createScopePayload() {
  const normalizedScope = normalizeDataScope(form.value.data_scope_type, form.value.data_scope_value, form.value.data_scope_value2);
  return { data_scope_type: normalizedScope.data_scope_type, data_scope_value: normalizedScope.data_scope_value, data_scope_value2: normalizedScope.data_scope_value2 };
}

function editScopePayload() {
  const normalizedScope = normalizeDataScope(editDataScopeType.value, editDataScopeValue.value, editDataScopeValue2.value);
  return { data_scope_type: normalizedScope.data_scope_type, data_scope_value: normalizedScope.data_scope_value, data_scope_value2: normalizedScope.data_scope_value2 };
}

async function previewScope(payload: { data_scope_type: string; data_scope_value: string; data_scope_value2: string; role: string }) {
  try {
    const r = await apiPost<any>('/api/users/preview-scope', payload);
    scopePreview.value = r.data || null;
    previewTargetPath.value = scopePreview.value?.route_checks?.find((item:any) => item.enabled)?.path || scopePreview.value?.route_checks?.[0]?.path || '';
    showScopePreview.value = true;
  } catch (e: any) {
    ElMessage.error(e.message || '预览失败');
  }
}

function previewCreateScope() {
  previewScope({ ...createScopePayload(), role: form.value.role });
}

function previewEditScope() {
  previewScope({ ...editScopePayload(), role: editRole.value });
}

function applyCreateTemplate() {
  form.value.permissions = buildTemplatePermissionMap(form.value.role, form.value.permission_template_code);
}

async function ensureScopeDictionariesLoaded() {
  try {
    systemSettings.value = await fetchSystemSettings();
  } catch {}
}

function applyEditTemplate() {
  editPermissions.value = buildTemplatePermissionMap(editRole.value, editTemplateCode.value);
}

function openCreate() {
  void ensureScopeDictionariesLoaded();
  form.value = { username:"", password:"", role:"viewer" as any, permission_template_code: getDefaultPermissionTemplate("viewer"), permissions: buildTemplatePermissionMap("viewer", getDefaultPermissionTemplate("viewer")), data_scope_type: 'all', data_scope_value: '', data_scope_value2: '' };
  showCreate.value = true;
}

async function createUser() {
  if (!form.value.username.trim()) return ElMessage.warning("请输入账号");
  const pv = validatePassword(form.value.password);
  if (!pv.ok) return ElMessage.warning(pv.msg || "密码不符合规则");
  const normalizedScope = normalizeDataScope(form.value.data_scope_type, form.value.data_scope_value, form.value.data_scope_value2);
  if ((normalizedScope.data_scope_type === 'department' || normalizedScope.data_scope_type === 'department_warehouse') && !normalizedScope.data_scope_value) return ElMessage.warning('请输入部门范围');
  if ((normalizedScope.data_scope_type === 'warehouse' || normalizedScope.data_scope_type === 'department_warehouse') && !normalizedScope.data_scope_value2 && normalizedScope.data_scope_type !== 'warehouse') return ElMessage.warning('请选择仓库范围');
  if (normalizedScope.data_scope_type === 'warehouse' && !normalizedScope.data_scope_value) return ElMessage.warning('请选择仓库范围');
  saving.value = true;
  try {
    const r = await apiPost<any>("/api/users", { ...form.value, ...normalizedScope });
    rows.value = [r.data as any, ...rows.value].slice(0, pageSize.value);
    total.value += 1;
    ElMessage.success("创建成功");
    showCreate.value = false;
    await load();
  } catch (e:any) {
    ElMessage.error(e.message || "创建失败");
  } finally {
    saving.value = false;
  }
}

function openEdit(row: Row) {
  void ensureScopeDictionariesLoaded();
  editing.value = row;
  editRole.value = row.role;
  editActive.value = !!row.is_active;
  editTemplateCode.value = normalizePermissionTemplateCode(row.role, row.permission_template_code);
  editPermissions.value = { ...(row.permissions || buildTemplatePermissionMap(row.role, row.permission_template_code)) };
  const scope = normalizeDataScope(row.data_scope_type, row.data_scope_value, row.data_scope_value2);
  editDataScopeType.value = scope.data_scope_type;
  editDataScopeValue.value = scope.data_scope_value;
  editDataScopeValue2.value = scope.data_scope_type === 'warehouse' ? scope.data_scope_value : scope.data_scope_value2;
  showEdit.value = true;
}

async function saveEdit() {
  if (!editing.value) return;
  const normalizedScope = normalizeDataScope(editDataScopeType.value, editDataScopeValue.value, editDataScopeValue2.value);
  if ((normalizedScope.data_scope_type === 'department' || normalizedScope.data_scope_type === 'department_warehouse') && !normalizedScope.data_scope_value) return ElMessage.warning('请输入部门范围');
  if (normalizedScope.data_scope_type === 'warehouse' && !normalizedScope.data_scope_value) return ElMessage.warning('请选择仓库范围');
  if (normalizedScope.data_scope_type === 'department_warehouse' && !normalizedScope.data_scope_value2) return ElMessage.warning('请选择仓库范围');
  saving.value = true;
  try {
    const r = await apiPut<any>("/api/users", { id: editing.value.id, role: editRole.value, is_active: editActive.value, permission_template_code: editTemplateCode.value, permissions: editPermissions.value, ...normalizedScope });
    rows.value = rows.value.map((item) => item.id === editing.value?.id ? ({ ...(item as any), ...(r.data as any) }) : item);
    ElMessage.success("已更新");
    showEdit.value = false;
    await load();
  } catch (e:any) {
    ElMessage.error(e.message || "更新失败");
  } finally {
    saving.value = false;
  }
}

function openReset(row: Row) {
  editing.value = row;
  resetPwd.value = "";
  showReset.value = true;
}

async function doReset() {
  if (!editing.value) return;
  const pv = validatePassword(resetPwd.value);
  if (!pv.ok) return ElMessage.warning(pv.msg || "密码不符合规则");
  saving.value = true;
  try {
    await apiPut<any>("/api/users", { id: editing.value.id, reset_password: resetPwd.value });
    ElMessage.success("已重置");
    showReset.value = false;
    await load();
  } catch (e:any) {
    ElMessage.error(e.message || "重置失败");
  } finally {
    saving.value = false;
  }
}

async function delUser(row: Row) {
  try {
    await ElMessageBox.confirm(`确定要删除用户「${row.username}」吗？
删除后无法恢复。`, "删除用户", { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" });
  } catch {
    return;
  }
  saving.value = true;
  try {
    await apiDelete<any>("/api/users", { id: row.id });
    ElMessage.success("已删除");
    await load();
  } catch (e: any) {
    ElMessage.error(e.message || "删除失败");
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  systemSettings.value = getCachedSystemSettings();
  void load();
});
</script>
