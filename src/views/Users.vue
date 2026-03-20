<template>
  <el-card>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px">
      <div>
        <span style="font-weight:700">用户管理</span>
        <span style="margin-left:10px; color:#999; font-size:12px">管理员可创建账号、分配权限、禁用账号、重置密码</span>
      </div>
      <el-button
        type="primary"
        @click="openCreate"
      >
        新增用户
      </el-button>
    </div>

    <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:12px">
      <el-input
        v-model="keyword"
        clearable
        style="width:240px"
        placeholder="搜索：账号"
        @keyup.enter="reload"
      />
      <el-select
        v-model="sortBy"
        style="width:170px"
        @change="reload"
      >
        <el-option
          label="账号"
          value="username"
        />
        <el-option
          label="角色"
          value="role"
        />
        <el-option
          label="状态"
          value="is_active"
        />
        <el-option
          label="创建时间"
          value="created_at"
        />
      </el-select>
      <el-select
        v-model="sortDir"
        style="width:120px"
        @change="reload"
      >
        <el-option
          label="升序"
          value="asc"
        />
        <el-option
          label="降序"
          value="desc"
        />
      </el-select>
      <el-button
        type="primary"
        plain
        @click="reload"
      >
        查询
      </el-button>
      <el-button @click="resetSearch">
        重置
      </el-button>
      <el-tag
        v-if="total"
        type="info"
        style="margin-left:auto"
      >
        共 {{ total }} 条
      </el-tag>
    </div>

    <el-table
      v-loading="loading"
      :data="rows"
      border
    >
      <el-table-column
        label="#"
        width="70"
      >
        <template #default="{ $index }">
          {{ (page - 1) * pageSize + $index + 1 }}
        </template>
      </el-table-column>
      <el-table-column
        prop="username"
        label="账号"
        width="160"
      />
      <el-table-column
        prop="role"
        label="角色"
        width="140"
      >
        <template #default="{ row }">
          <el-tag :type="row.role==='admin'?'danger':row.role==='operator'?'warning':'info'">
            {{ roleText(row.role) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="is_active"
        label="状态"
        width="110"
      >
        <template #default="{ row }">
          <el-tag :type="row.is_active? 'success':'info'">
            {{ row.is_active ? "启用" : "禁用" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="must_change_password"
        label="需改密码"
        width="110"
      >
        <template #default="{ row }">
          <el-tag :type="row.must_change_password? 'warning':'success'">
            {{ row.must_change_password ? "是" : "否" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="创建时间"
        min-width="170"
      >
        <template #default="{ row }">
          {{ formatBeijingDateTime(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        min-width="260"
      >
        <template #default="{ row }">
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            <el-button
              size="small"
              @click="openEdit(row)"
            >
              权限/状态
            </el-button>
            <el-button
              size="small"
              type="warning"
              plain
              @click="openReset(row)"
            >
              重置密码
            </el-button>
            <el-button
              v-if="auth.user?.role==='admin'"
              size="small"
              type="danger"
              plain
              :disabled="row.id===auth.user?.id"
              @click="delUser(row)"
            >
              删除
            </el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <div
      v-if="total"
      style="display:flex; justify-content:flex-end; margin-top:12px"
    >
      <el-pagination
        background
        layout="total, sizes, prev, pager, next, jumper"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        :page-sizes="[20,50,100,200]"
        @current-change="(p:number)=>{ page=p; load(); }"
        @size-change="(s:number)=>{ pageSize=s; page=1; load(); }"
      />
    </div>

    <!-- Create -->
    <el-dialog
      v-model="showCreate"
      title="新增用户"
      width="460px"
    >
      <el-form label-width="90px">
        <el-form-item label="账号">
          <el-input v-model="form.username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            type="password"
            show-password
          />
          <div style="color:#999; font-size:12px; margin-top:6px">
            密码长度需为 6-64 位，且必须同时包含字母和数字
          </div>
        </el-form-item>
        <el-form-item label="角色">
          <el-select
            v-model="form.role"
            style="width:100%"
          >
            <el-option
              label="管理员"
              value="admin"
            />
            <el-option
              label="操作员"
              value="operator"
            />
            <el-option
              label="只读"
              value="viewer"
            />
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
        <el-button @click="showCreate=false">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="saving"
          @click="createUser"
        >
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- Edit -->
    <el-dialog
      v-model="showEdit"
      title="权限/状态"
      width="460px"
    >
      <el-form label-width="90px">
        <el-form-item label="账号">
          <el-input
            :model-value="editing?.username"
            disabled
          />
        </el-form-item>
        <el-form-item label="角色">
          <el-select
            v-model="editRole"
            style="width:100%"
          >
            <el-option
              label="管理员"
              value="admin"
            />
            <el-option
              label="操作员"
              value="operator"
            />
            <el-option
              label="只读"
              value="viewer"
            />
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
        <el-form-item label="状态">
          <el-switch
            v-model="editActive"
            active-text="启用"
            inactive-text="禁用"
          />
        </el-form-item>
        <el-form-item label="细分权限">
          <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; width:100%">
            <el-checkbox v-for="code in ALL_PERMISSION_CODES" :key="code" :model-value="!!editPermissions[code]" @change="(v:any)=>editPermissions[code]=!!v">{{ PERMISSION_LABEL[code] }}</el-checkbox>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit=false">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="saving"
          @click="saveEdit"
        >
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- Reset -->
    <el-dialog
      v-model="showReset"
      title="重置密码"
      width="460px"
    >
      <div style="color:#666; margin-bottom:10px">
        将为账号 <b>{{ editing?.username }}</b> 设置新密码，并要求下次登录修改。
      </div>
      <el-form label-width="90px">
        <el-form-item label="新密码">
          <el-input
            v-model="resetPwd"
            type="password"
            show-password
          />
          <div style="color:#999; font-size:12px; margin-top:6px">
            密码长度需为 6-64 位，且必须同时包含字母和数字
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showReset=false">
          取消
        </el-button>
        <el-button
          type="warning"
          :loading="saving"
          @click="doReset"
        >
          确认重置
        </el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useAuth } from "../store/auth";
import { formatBeijingDateTime } from "../utils/datetime";
import { ElMessage, ElMessageBox } from "element-plus";
import { apiGet, apiPost, apiPut, apiDelete } from "../api/client";
import { validatePassword } from "../utils/password";
import { ALL_PERMISSION_CODES, ALL_PERMISSION_TEMPLATE_CODES, PERMISSION_LABEL, PERMISSION_TEMPLATE_LABEL, buildTemplatePermissionMap, getDefaultPermissionTemplate, normalizePermissionTemplateCode, type PermissionCode, type PermissionTemplateCode } from "../utils/permissions";

type Row = { id:number; username:string; role:"admin"|"operator"|"viewer"; is_active:number; must_change_password:number; created_at:string; permission_template_code?: string | null; permissions?: Record<string, boolean> };

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

const form = ref({ username:"", password:"", role:"viewer" as any, permission_template_code: getDefaultPermissionTemplate("viewer") as PermissionTemplateCode, permissions: {} as Record<string, boolean> });

const editing = ref<Row|null>(null);
const editRole = ref<"admin"|"operator"|"viewer">("viewer");
const editActive = ref(true);
const editPermissions = ref<Record<string, boolean>>({});
const editTemplateCode = ref<PermissionTemplateCode>(getDefaultPermissionTemplate("viewer"));
const resetPwd = ref("");

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
    const r = await apiGet<{ ok:boolean; data: Row[]; total:number }>("/api/users?" + qs.toString());
    rows.value = r.data || [];
    total.value = Number((r as any).total || 0);
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

function applyCreateTemplate() {
  form.value.permissions = buildTemplatePermissionMap(form.value.role, form.value.permission_template_code);
}

function applyEditTemplate() {
  editPermissions.value = buildTemplatePermissionMap(editRole.value, editTemplateCode.value);
}

function openCreate() {
  form.value = { username:"", password:"", role:"viewer" as any, permission_template_code: getDefaultPermissionTemplate("viewer"), permissions: buildTemplatePermissionMap("viewer", getDefaultPermissionTemplate("viewer")) };
  showCreate.value = true;
}

async function createUser() {
  if (!form.value.username.trim()) return ElMessage.warning("请输入账号");
  const pv = validatePassword(form.value.password);
  if (!pv.ok) return ElMessage.warning(pv.msg || "密码不符合规则");
  saving.value = true;
  try {
    await apiPost<any>("/api/users", form.value);
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
  editing.value = row;
  editRole.value = row.role;
  editActive.value = !!row.is_active;
  editTemplateCode.value = normalizePermissionTemplateCode(row.role, row.permission_template_code);
  editPermissions.value = { ...(row.permissions || buildTemplatePermissionMap(row.role, row.permission_template_code)) };
  showEdit.value = true;
}

async function saveEdit() {
  if (!editing.value) return;
  saving.value = true;
  try {
    await apiPut<any>("/api/users", { id: editing.value.id, role: editRole.value, is_active: editActive.value, permission_template_code: editTemplateCode.value, permissions: editPermissions.value });
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
    await ElMessageBox.confirm(
      `确定要删除用户「${row.username}」吗？\n删除后无法恢复。`,
      "删除用户",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
    );
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

onMounted(load);
</script>
