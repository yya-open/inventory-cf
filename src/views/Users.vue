<template>
  <div class="ui-page-shell users-page">
    <div class="ui-page-heading">
      <div class="ui-page-heading__main">
        <div class="ui-page-heading__kicker">系统管理</div>
        <div class="ui-page-heading__title">用户管理</div>
        <div class="ui-page-heading__desc">创建账号、分配权限、禁用账号、重置密码，并配置数据可见范围。</div>
      </div>
      <el-button type="primary" @click="openCreate">新增用户</el-button>
    </div>

    <div class="ui-panel users-filter-panel">
      <el-input v-model="keyword" clearable class="users-filter-input" placeholder="搜索：账号" @keyup.enter="reload" />
      <el-select v-model="sortBy" class="users-filter-sort" @change="reload">
        <el-option label="账号" value="username" />
        <el-option label="角色" value="role" />
        <el-option label="状态" value="is_active" />
        <el-option label="创建时间" value="created_at" />
      </el-select>
      <el-select v-model="sortDir" class="users-filter-dir" @change="reload">
        <el-option label="升序" value="asc" />
        <el-option label="降序" value="desc" />
      </el-select>
      <el-button type="primary" plain @click="reload">查询</el-button>
      <el-button @click="resetSearch">重置</el-button>
      <el-tag v-if="total" type="info" class="users-filter-total">共 {{ total }} 条</el-tag>
    </div>

    <div class="ui-panel ui-table-panel">
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
          <div class="ui-row-actions">
            <el-button size="small" @click="openEdit(row)">权限/状态</el-button>
            <el-button size="small" type="warning" plain @click="openReset(row)">重置密码</el-button>
            <el-button v-if="auth.user?.role==='admin'" size="small" type="danger" plain :disabled="row.id===auth.user?.id" @click="delUser(row)">删除</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="total" class="ui-table-panel__footer">
      <el-pagination background layout="total, sizes, prev, pager, next, jumper" :total="total" :page-size="pageSize" :current-page="page" :page-sizes="[20,50,100,200]" @current-change="(p:number)=>{ page=p; load(); }" @size-change="(s:number)=>{ pageSize=s; page=1; load(); }" />
    </div>
    </div>

    <el-dialog v-model="showCreate" title="新增用户" width="520px">
      <el-form label-width="100px">
        <el-form-item label="账号"><el-input v-model="form.username" /></el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password />
          <div class="u-text-subtle u-fs-12 u-mt-6">密码长度需为 6-64 位，且必须同时包含字母和数字</div>
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" class="u-w-full">
            <el-option label="管理员" value="admin" />
            <el-option label="操作员" value="operator" />
            <el-option label="只读" value="viewer" />
          </el-select>
        </el-form-item>
        <el-form-item label="数据范围">
          <div class="u-flex u-gap-8 u-w-full">
            <el-select v-model="form.data_scope_type" class="u-flex-1">
            <el-option v-for="item in DATA_SCOPE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <el-button @click="previewCreateScope">预览范围</el-button>
          </div>
        </el-form-item>
        <el-form-item v-if="form.data_scope_type === 'department' || form.data_scope_type === 'department_warehouse'" label="部门">
          <el-input v-model="form.data_scope_value" clearable placeholder="请输入部门" />
        </el-form-item>
        <el-form-item v-if="form.data_scope_type === 'warehouse' || form.data_scope_type === 'department_warehouse'" label="仓库">
          <el-select v-model="createWarehouseScopeValue" multiple collapse-tags collapse-tags-tooltip filterable clearable class="u-w-full" placeholder="请选择一个或多个授权仓域">
            <el-option v-for="item in warehouseOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="访问摘要">
          <div class="access-summary">
            <div class="access-summary__head">
              <el-tag :type="createAccessSummary.ready ? 'success' : 'warning'">{{ createAccessSummary.scopeLabel }}</el-tag>
              <span class="access-summary__hint">{{ createAccessSummary.roleHint }}</span>
            </div>
            <div class="access-summary__row">
              <span class="access-summary__label">可见模块</span>
              <el-tag v-for="item in createAccessSummary.modules" :key="item.label" :type="item.enabled ? 'success' : 'info'" effect="plain">{{ item.label }}</el-tag>
            </div>
            <div v-if="createAccessSummary.systemEntries.length" class="access-summary__row">
              <span class="access-summary__label">系统入口</span>
              <el-tag v-for="item in createAccessSummary.systemEntries" :key="item" type="warning" effect="plain">{{ item }}</el-tag>
            </div>
            <div class="access-summary__note">{{ createAccessSummary.note }}</div>
          </div>
        </el-form-item>
        <el-form-item label="权限模板">
          <div class="u-flex u-gap-8 u-w-full">
            <el-select v-model="form.permission_template_code" class="u-flex-1">
              <el-option v-for="item in permissionTemplateOptions" :key="item.code" :label="item.label" :value="item.code" />
            </el-select>
            <el-button @click="applyCreateTemplate">套用</el-button>
          </div>
        </el-form-item>
        <el-form-item label="细分权限">
          <div class="u-grid-permissions u-gap-6 u-w-full">
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
          <el-select v-model="editRole" class="u-w-full">
            <el-option label="管理员" value="admin" />
            <el-option label="操作员" value="operator" />
            <el-option label="只读" value="viewer" />
          </el-select>
        </el-form-item>
        <el-form-item label="数据范围">
          <div class="u-flex u-gap-8 u-w-full">
            <el-select v-model="editDataScopeType" class="u-flex-1">
            <el-option v-for="item in DATA_SCOPE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <el-button @click="previewEditScope">预览范围</el-button>
          </div>
        </el-form-item>
        <el-form-item v-if="editDataScopeType === 'department' || editDataScopeType === 'department_warehouse'" label="部门">
          <el-input v-model="editDataScopeValue" clearable placeholder="请输入部门" />
        </el-form-item>
        <el-form-item v-if="editDataScopeType === 'warehouse' || editDataScopeType === 'department_warehouse'" label="仓库">
          <el-select v-model="editWarehouseScopeValue" multiple collapse-tags collapse-tags-tooltip filterable clearable class="u-w-full" placeholder="请选择一个或多个授权仓域">
            <el-option v-for="item in warehouseOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="访问摘要">
          <div class="access-summary">
            <div class="access-summary__head">
              <el-tag :type="editAccessSummary.ready ? 'success' : 'warning'">{{ editAccessSummary.scopeLabel }}</el-tag>
              <span class="access-summary__hint">{{ editAccessSummary.roleHint }}</span>
            </div>
            <div class="access-summary__row">
              <span class="access-summary__label">可见模块</span>
              <el-tag v-for="item in editAccessSummary.modules" :key="item.label" :type="item.enabled ? 'success' : 'info'" effect="plain">{{ item.label }}</el-tag>
            </div>
            <div v-if="editAccessSummary.systemEntries.length" class="access-summary__row">
              <span class="access-summary__label">系统入口</span>
              <el-tag v-for="item in editAccessSummary.systemEntries" :key="item" type="warning" effect="plain">{{ item }}</el-tag>
            </div>
            <div class="access-summary__change">
              <div class="access-summary__row">
                <span class="access-summary__label">变更影响</span>
                <el-tag effect="plain">{{ editAccessImpact.beforeLabel }}</el-tag>
                <span class="access-summary__arrow">保存后</span>
                <el-tag :type="editAccessSummary.ready ? 'success' : 'warning'" effect="plain">{{ editAccessImpact.afterLabel }}</el-tag>
              </div>
              <div v-if="editAccessImpact.added.length || editAccessImpact.removed.length" class="access-summary__row">
                <span class="access-summary__label"></span>
                <el-tag v-for="item in editAccessImpact.added" :key="`add-${item}`" type="success" effect="plain">新增 {{ item }}</el-tag>
                <el-tag v-for="item in editAccessImpact.removed" :key="`remove-${item}`" type="danger" effect="plain">移除 {{ item }}</el-tag>
              </div>
              <div v-if="editAccessImpact.routeAdded.length || editAccessImpact.routeRemoved.length" class="access-summary__row">
                <span class="access-summary__label">页面入口</span>
                <el-tag v-for="item in editAccessImpact.routeAdded" :key="`route-add-${item}`" type="success" effect="plain">新增 {{ item }}</el-tag>
                <el-tag v-for="item in editAccessImpact.routeRemoved" :key="`route-remove-${item}`" type="danger" effect="plain">移除 {{ item }}</el-tag>
              </div>
              <div v-else class="access-summary__note">{{ editAccessImpact.changed ? '范围说明有变化，业务仓域可见性不变。' : '与当前可见范围一致。' }}</div>
            </div>
            <div class="access-summary__note">{{ editAccessSummary.note }}</div>
          </div>
        </el-form-item>
        <el-form-item label="权限模板">
          <div class="u-flex u-gap-8 u-w-full">
            <el-select v-model="editTemplateCode" class="u-flex-1">
              <el-option v-for="item in permissionTemplateOptions" :key="item.code" :label="item.label" :value="item.code" />
            </el-select>
            <el-button @click="applyEditTemplate">套用</el-button>
          </div>
        </el-form-item>
        <el-form-item label="状态"><el-switch v-model="editActive" active-text="启用" inactive-text="禁用" /></el-form-item>
        <el-form-item label="细分权限">
          <div class="u-grid-permissions u-gap-6 u-w-full">
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
      <div v-if="scopePreview" class="u-col-gap-12">
        <div class="u-row-wrap-8">
          <el-tag type="warning">{{ scopePreview.scope_label }}</el-tag>
          <el-tag v-for="item in scopePreview.route_meta?.report_modes || []" :key="item.value" type="success">看板：{{ item.label }}</el-tag>
        </div>
        <el-alert type="info" :closable="false" show-icon>
          <template #default>
            <div v-for="tip in scopePreview.tips || []" :key="tip">{{ tip }}</div>
          </template>
        </el-alert>
        <el-card shadow="never">
          <div class="u-flex u-items-center u-gap-10 u-flex-wrap">
            <div class="u-fw-700">权限策略测试器</div>
            <el-select v-model="previewTargetPath" class="u-min-w-280">
              <el-option v-for="item in scopePreview.route_checks || []" :key="item.path" :label="item.label" :value="item.path" />
            </el-select>
            <el-tag v-if="previewRouteResult" :type="previewRouteResult.enabled ? 'success' : 'danger'">{{ previewRouteResult.enabled ? '允许访问' : '将被拦截' }}</el-tag>
          </div>
          <div class="u-mt-8 u-text-muted">{{ previewRouteResult?.reason || '请选择一个入口查看策略结果' }}</div>
        </el-card>
        <el-row :gutter="12">
          <el-col :span="8"><el-card shadow="never"><div class="u-text-subtle">电脑台账</div><div class="u-fs-26 u-fw-700">{{ scopePreview.counts?.pc_assets ?? 0 }}</div></el-card></el-col>
          <el-col :span="8"><el-card shadow="never"><div class="u-text-subtle">显示器台账</div><div class="u-fs-26 u-fw-700">{{ scopePreview.counts?.monitor_assets ?? 0 }}</div></el-card></el-col>
          <el-col :span="8"><el-card shadow="never"><div class="u-text-subtle">配件条目</div><div class="u-fs-26 u-fw-700">{{ scopePreview.counts?.parts_items ?? 0 }}</div></el-card></el-col>
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
      <div v-else class="u-text-subtle">暂无预览数据</div>
      <template #footer>
        <el-button @click="showScopePreview=false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showReset" title="重置密码" width="460px" class="password-dialog password-dialog--reset">
      <div class="password-dialog__notice">将为账号 <b>{{ editing?.username }}</b> 设置新密码，并要求下次登录修改。</div>
      <el-form class="password-dialog__form" label-position="top">
        <el-form-item label="新密码">
          <el-input v-model="resetPwd" type="password" show-password />
          <div class="password-dialog__tip">密码长度需为 6-64 位，且必须同时包含字母和数字</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showReset=false">取消</el-button>
        <el-button type="warning" :loading="saving" @click="doReset">确认重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { fetchMe, useAuth } from "../store/auth";
import { formatBeijingDateTime } from "../utils/datetime";
import { ElMessage, ElMessageBox } from "../utils/el-services";
import { apiGet, apiPost, apiPut, apiDelete, isApiErrorCode } from "../api/client";
import { validatePassword } from "../utils/password";
import { getAccessibleRouteLabels } from "../utils/moduleAccess";
import { ALL_PERMISSION_CODES, ALL_PERMISSION_TEMPLATE_CODES, PERMISSION_LABEL, PERMISSION_TEMPLATE_LABEL, buildTemplatePermissionMap, getDefaultPermissionTemplate, normalizePermissionTemplateCode, type PermissionTemplateCode } from "../utils/permissions";
import { DATA_SCOPE_OPTIONS, PERMISSION_WAREHOUSE_OPTIONS, dataScopeLabel, encodeWarehouseScopeValues, normalizeDataScope, scopeModeOptions, warehouseScopeValues } from "../utils/dataScope";

type Row = {
  id:number;
  username:string;
  role:"admin"|"operator"|"viewer";
  is_active:number;
  must_change_password:number;
  created_at:string;
  permission_template_code?: string | null;
  permissions?: Record<string, boolean>;
  permission_overrides?: Record<string, boolean>;
  permission_override_count?: number;
  data_scope_type?: 'all' | 'department' | 'warehouse' | 'department_warehouse';
  data_scope_value?: string | null;
  data_scope_value2?: string | null;
};

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
const scopePreviewCache = new Map<string, any>();

const warehouseOptions = PERMISSION_WAREHOUSE_OPTIONS.map((label) => label);
const createWarehouseScopeValue = computed({
  get: () => warehouseScopeValues(form.value.data_scope_type === 'warehouse' ? form.value.data_scope_value : form.value.data_scope_value2),
  set: (value: string[]) => {
    const encoded = encodeWarehouseScopeValues(value || []);
    if (form.value.data_scope_type === 'warehouse') form.value.data_scope_value = encoded;
    else form.value.data_scope_value2 = encoded;
  },
});

const editWarehouseScopeValue = computed({
  get: () => warehouseScopeValues(editDataScopeType.value === 'warehouse' ? editDataScopeValue.value : editDataScopeValue2.value),
  set: (value: string[]) => {
    const encoded = encodeWarehouseScopeValues(value || []);
    if (editDataScopeType.value === 'warehouse') editDataScopeValue.value = encoded;
    else editDataScopeValue2.value = encoded;
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
const editBaseSnapshot = ref<{ role: string; permissions: Record<string, boolean>; scope: DraftScope } | null>(null);

type DraftScope = {
  data_scope_type: 'all' | 'department' | 'warehouse' | 'department_warehouse';
  data_scope_value: string;
  data_scope_value2: string;
};

const MODE_LABEL: Record<string, string> = {
  parts: '配件仓',
  pc: '电脑仓',
  monitor: '显示器仓',
};

function roleLevel(role: string) {
  return role === 'admin' ? 3 : role === 'operator' ? 2 : 1;
}

function buildPreviewCacheKey(payload: { data_scope_type: string; data_scope_value: string; data_scope_value2: string; role: string }) {
  return JSON.stringify({
    role: String(payload.role || ''),
    data_scope_type: String(payload.data_scope_type || ''),
    data_scope_value: String(payload.data_scope_value || ''),
    data_scope_value2: String(payload.data_scope_value2 || ''),
  });
}

function buildScopeState(scope: DraftScope) {
  const type = scope.data_scope_type;
  const department = String(scope.data_scope_value || '').trim();
  const warehouses = warehouseScopeValues(type === 'department_warehouse' ? scope.data_scope_value2 : (scope.data_scope_value || scope.data_scope_value2));
  if (type === 'department' && !department) return { ready: false, scopeLabel: '待填写部门', modes: [] as string[] };
  if (type === 'warehouse' && !warehouses.length) return { ready: false, scopeLabel: '待选择仓库', modes: [] as string[] };
  if (type === 'department_warehouse' && (!department || !warehouses.length)) return { ready: false, scopeLabel: !department ? '待填写部门' : '待选择仓库', modes: [] as string[] };
  const normalized = normalizeDataScope(type, scope.data_scope_value, scope.data_scope_value2);
  return {
    ready: true,
    scopeLabel: dataScopeLabel(normalized.data_scope_type, normalized.data_scope_value, normalized.data_scope_value2),
    modes: [...scopeModeOptions(normalized.data_scope_type, normalized.data_scope_value, normalized.data_scope_value2)] as string[],
  };
}

function buildSystemEntries(role: string, permissions: Record<string, boolean>) {
  if (role === 'admin') return ['系统管理', '报表看板', '用户管理', '备份恢复'];
  const entries: string[] = [];
  if (permissions.async_job_manage) entries.push('批量任务');
  if (permissions.audit_export) entries.push('审计日志');
  if (permissions.system_settings_write) entries.push('系统配置');
  if (permissions.ops_tools) entries.push('运维工具');
  return entries;
}

function buildAccessSummary(role: string, permissions: Record<string, boolean>, scope: DraftScope) {
  const state = buildScopeState(scope);
  const modes = new Set(state.modes);
  const canOperate = roleLevel(role) >= 2;
  const systemEntries = buildSystemEntries(role, permissions);
  const routeLabels = getAccessibleRouteLabels({
    role,
    permissions,
    data_scope_type: scope.data_scope_type,
    data_scope_value: scope.data_scope_value,
    data_scope_value2: scope.data_scope_value2,
  });
  const modules = [
    { label: '配件仓', enabled: modes.has('parts') },
    { label: '电脑仓', enabled: modes.has('pc') },
    { label: '显示器仓', enabled: modes.has('monitor') },
  ];
  const enabledLabels = modules.filter((item) => item.enabled).map((item) => item.label);
  const roleHint = canOperate ? `${roleText(role)}：可执行授权范围内的业务操作` : `${roleText(role)}：仅查看授权范围内数据`;
  const note = state.ready
    ? (enabledLabels.length ? `保存后可见：${enabledLabels.join('、')}` : '当前数据范围没有可见业务仓域')
    : '请补全数据范围后再保存，摘要会实时更新。';
  return { ...state, modules, systemEntries, routeLabels, roleHint, note };
}

function scopeFromRow(row?: Row | null): DraftScope {
  const scope = normalizeDataScope(row?.data_scope_type, row?.data_scope_value, row?.data_scope_value2);
  return {
    data_scope_type: scope.data_scope_type,
    data_scope_value: scope.data_scope_value,
    data_scope_value2: scope.data_scope_value2,
  };
}

function moduleLabelsFromModes(modes: string[]) {
  return modes.map((mode) => MODE_LABEL[mode] || mode);
}

const editAccessImpact = computed(() => {
  const base = editBaseSnapshot.value || {
    role: editing.value?.role || 'viewer',
    permissions: editing.value?.permissions || {},
    scope: scopeFromRow(editing.value),
  };
  const before = buildAccessSummary(base.role, base.permissions, base.scope);
  const after = buildScopeState({
    data_scope_type: editDataScopeType.value,
    data_scope_value: editDataScopeValue.value,
    data_scope_value2: editDataScopeValue2.value,
  });
  const currentRouteLabels = getAccessibleRouteLabels({
    role: editRole.value,
    permissions: editPermissions.value,
    data_scope_type: editDataScopeType.value,
    data_scope_value: editDataScopeValue.value,
    data_scope_value2: editDataScopeValue2.value,
  });
  const beforeRoutes = new Set(before.routeLabels);
  const afterRoutes = new Set(currentRouteLabels);
  const routeAdded = currentRouteLabels.filter((label) => !beforeRoutes.has(label));
  const routeRemoved = before.routeLabels.filter((label) => !afterRoutes.has(label));
  const beforeModes = new Set(before.modes);
  const afterModes = new Set(after.modes);
  const added = moduleLabelsFromModes(after.modes.filter((mode) => !beforeModes.has(mode)));
  const removed = moduleLabelsFromModes(before.modes.filter((mode) => !afterModes.has(mode)));
  return {
    beforeLabel: before.scopeLabel,
    afterLabel: after.scopeLabel,
    added,
    removed,
    routeAdded,
    routeRemoved,
    changed: before.scopeLabel !== after.scopeLabel || added.length > 0 || removed.length > 0 || routeAdded.length > 0 || routeRemoved.length > 0,
  };
});

const createAccessSummary = computed(() => buildAccessSummary(form.value.role, form.value.permissions, {
  data_scope_type: form.value.data_scope_type,
  data_scope_value: form.value.data_scope_value,
  data_scope_value2: form.value.data_scope_value2,
}));

const editAccessSummary = computed(() => buildAccessSummary(editRole.value, editPermissions.value, {
  data_scope_type: editDataScopeType.value,
  data_scope_value: editDataScopeValue.value,
  data_scope_value2: editDataScopeValue2.value,
}));

watch(() => form.value.data_scope_type, (type) => {
  if (type === 'all') {
    form.value.data_scope_value = '';
    form.value.data_scope_value2 = '';
    return;
  }
  if (type === 'department') form.value.data_scope_value2 = '';
  if (type === 'warehouse') {
    form.value.data_scope_value = encodeWarehouseScopeValues(warehouseScopeValues(form.value.data_scope_value || form.value.data_scope_value2));
    form.value.data_scope_value2 = '';
  }
  if (type === 'department_warehouse' && warehouseScopeValues(form.value.data_scope_value).length && !form.value.data_scope_value2) {
    form.value.data_scope_value2 = encodeWarehouseScopeValues(warehouseScopeValues(form.value.data_scope_value));
    form.value.data_scope_value = '';
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
    editDataScopeValue.value = encodeWarehouseScopeValues(warehouseScopeValues(editDataScopeValue.value || editDataScopeValue2.value));
    editDataScopeValue2.value = '';
  }
  if (type === 'department_warehouse' && warehouseScopeValues(editDataScopeValue.value).length && !editDataScopeValue2.value) {
    editDataScopeValue2.value = encodeWarehouseScopeValues(warehouseScopeValues(editDataScopeValue.value));
    editDataScopeValue.value = '';
  }
});

function roleText(r: string) {
  return r==="admin" ? "管理员" : r==="operator" ? "操作员" : "只读";
}

function userErrorHint(e: unknown) {
  if (isApiErrorCode(e, 'USER_USERNAME_REQUIRED')) return '请先填写用户账号';
  if (isApiErrorCode(e, 'USER_PASSWORD_POLICY_INVALID')) return '密码不符合规则，请检查复杂度要求';
  if (isApiErrorCode(e, 'USER_ROLE_INVALID')) return '角色配置无效，请刷新页面后重试';
  if (isApiErrorCode(e, 'USERNAME_ALREADY_EXISTS')) return '该账号已存在，请更换用户名';
  if (isApiErrorCode(e, 'USER_NOT_FOUND')) return '目标用户不存在，可能已被删除';
  if (isApiErrorCode(e, 'USER_ID_INVALID')) return '用户标识无效，请刷新后重试';
  if (isApiErrorCode(e, 'USER_SELF_DISABLE_FORBIDDEN')) return '不能禁用当前登录账号';
  if (isApiErrorCode(e, 'USER_SELF_DELETE_FORBIDDEN')) return '不能删除当前登录账号';
  if (isApiErrorCode(e, 'USER_LAST_ADMIN_REQUIRED')) return '系统至少需要保留一个启用的管理员账号';
  if (isApiErrorCode(e, 'USER_SCOPE_WAREHOUSE_REQUIRED')) return '请选择仓库范围';
  if (isApiErrorCode(e, 'USER_SCOPE_WAREHOUSE_INVALID')) return '仓库范围不是可授权仓域，请刷新页面后重试';
  return '';
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
    qs.set("view", "lite");
    const r = await apiGet<{ ok:boolean; data: Row[]; meta?: { total?: number } }>("/api/users?" + qs.toString(), { cache: "no-store" });
    rows.value = r.data || [];
    total.value = Number((r as any).meta?.total || 0);
  } catch (e:any) {
    ElMessage.error(userErrorHint(e) || e.message || "加载失败");
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

function draftScopeWarning(scope: DraftScope) {
  const state = buildScopeState(scope);
  return state.ready ? '' : state.scopeLabel;
}

async function previewScope(payload: { data_scope_type: string; data_scope_value: string; data_scope_value2: string; role: string }) {
  try {
    const cacheKey = buildPreviewCacheKey(payload);
    const cached = scopePreviewCache.get(cacheKey);
    if (cached) {
      scopePreview.value = cached;
    } else {
      const r = await apiPost<any>('/api/users/preview-scope', payload);
      scopePreview.value = r.data || null;
      scopePreviewCache.set(cacheKey, scopePreview.value);
    }
    previewTargetPath.value = scopePreview.value?.route_checks?.find((item:any) => item.enabled)?.path || scopePreview.value?.route_checks?.[0]?.path || '';
    showScopePreview.value = true;
  } catch (e: any) {
    ElMessage.error(userErrorHint(e) || e.message || '预览失败');
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

function applyEditTemplate() {
  editPermissions.value = buildTemplatePermissionMap(editRole.value, editTemplateCode.value);
}

function openCreate() {
  form.value = { username:"", password:"", role:"viewer" as any, permission_template_code: getDefaultPermissionTemplate("viewer"), permissions: buildTemplatePermissionMap("viewer", getDefaultPermissionTemplate("viewer")), data_scope_type: 'all', data_scope_value: '', data_scope_value2: '' };
  showCreate.value = true;
}

async function createUser() {
  if (!form.value.username.trim()) return ElMessage.warning("请输入账号");
  const pv = validatePassword(form.value.password);
  if (!pv.ok) return ElMessage.warning(pv.msg || "密码不符合规则");
  const draftWarning = draftScopeWarning({ data_scope_type: form.value.data_scope_type, data_scope_value: form.value.data_scope_value, data_scope_value2: form.value.data_scope_value2 });
  if (draftWarning) return ElMessage.warning(draftWarning);
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
    ElMessage.error(userErrorHint(e) || e.message || "创建失败");
  } finally {
    saving.value = false;
  }
}

function openEdit(row: Row) {
  editing.value = row;
  editRole.value = row.role;
  editActive.value = !!row.is_active;
  editTemplateCode.value = normalizePermissionTemplateCode(row.role, row.permission_template_code);
  const basePermissions = row.permissions || buildTemplatePermissionMap(row.role, row.permission_template_code);
  const overrides = row.permission_overrides && typeof row.permission_overrides === 'object' ? row.permission_overrides : {};
  const mergedPermissions: Record<string, boolean> = { ...(basePermissions as Record<string, boolean>) };
  for (const [code, allowed] of Object.entries(overrides)) mergedPermissions[code] = !!allowed;
  editPermissions.value = mergedPermissions;
  const scope = normalizeDataScope(row.data_scope_type, row.data_scope_value, row.data_scope_value2);
  editDataScopeType.value = scope.data_scope_type;
  editDataScopeValue.value = scope.data_scope_value;
  editDataScopeValue2.value = scope.data_scope_value2;
  editBaseSnapshot.value = {
    role: row.role,
    permissions: { ...mergedPermissions },
    scope: {
      data_scope_type: scope.data_scope_type,
      data_scope_value: scope.data_scope_value,
      data_scope_value2: scope.data_scope_value2,
    },
  };
  showEdit.value = true;
}

async function saveEdit() {
  if (!editing.value) return;
  const draftWarning = draftScopeWarning({ data_scope_type: editDataScopeType.value, data_scope_value: editDataScopeValue.value, data_scope_value2: editDataScopeValue2.value });
  if (draftWarning) return ElMessage.warning(draftWarning);
  const normalizedScope = normalizeDataScope(editDataScopeType.value, editDataScopeValue.value, editDataScopeValue2.value);
  if ((normalizedScope.data_scope_type === 'department' || normalizedScope.data_scope_type === 'department_warehouse') && !normalizedScope.data_scope_value) return ElMessage.warning('请输入部门范围');
  if (normalizedScope.data_scope_type === 'warehouse' && !normalizedScope.data_scope_value) return ElMessage.warning('请选择仓库范围');
  if (normalizedScope.data_scope_type === 'department_warehouse' && !normalizedScope.data_scope_value2) return ElMessage.warning('请选择仓库范围');
  saving.value = true;
  try {
    const isEditingSelf = editing.value.id === auth.user?.id;
    const r = await apiPut<any>("/api/users", { id: editing.value.id, role: editRole.value, is_active: editActive.value, permission_template_code: editTemplateCode.value, permissions: editPermissions.value, ...normalizedScope });
    rows.value = rows.value.map((item) => item.id === editing.value?.id ? ({ ...(item as any), ...(r.data as any) }) : item);
    if (isEditingSelf) await fetchMe({ force: true });
    ElMessage.success("已更新");
    showEdit.value = false;
    await load();
  } catch (e:any) {
    ElMessage.error(userErrorHint(e) || e.message || "更新失败");
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
    ElMessage.error(userErrorHint(e) || e.message || "重置失败");
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
    ElMessage.error(userErrorHint(e) || e.message || "删除失败");
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<style scoped>
.users-filter-panel {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 14px;
}

.users-filter-input {
  width: 240px;
}

.users-filter-sort {
  width: 170px;
}

.users-filter-dir {
  width: 120px;
}

.users-filter-total {
  margin-left: auto;
}

.access-summary {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-soft);
}

.access-summary__head,
.access-summary__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.access-summary__row {
  margin-top: 8px;
}

.access-summary__hint,
.access-summary__note,
.access-summary__label {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}

.access-summary__label {
  width: 56px;
  flex: none;
  color: var(--subtle);
}

.access-summary__note {
  margin-top: 8px;
}

.access-summary__change {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-strong);
}

.access-summary__arrow {
  color: var(--subtle);
  font-size: 12px;
}

@media (max-width: 768px) {
  .users-filter-input,
  .users-filter-sort,
  .users-filter-dir,
  .users-filter-panel .el-button {
    width: 100%;
  }

  .users-filter-total {
    margin-left: 0;
  }
}
</style>
