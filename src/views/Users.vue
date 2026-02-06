<template>
  <el-card>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px">
      <div>
        <span style="font-weight:700">用户管理</span>
        <span style="margin-left:10px; color:#999; font-size:12px">管理员可创建账号、分配权限、禁用账号、重置密码</span>
      </div>
      <el-button type="primary" @click="openCreate">新增用户</el-button>
    </div>

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="username" label="账号" width="160" />
      <el-table-column prop="role" label="角色" width="140">
        <template #default="{ row }">
          <el-tag :type="row.role==='admin'?'danger':row.role==='operator'?'warning':'info'">
            {{ roleText(row.role) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="is_active" label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="row.is_active? 'success':'info'">{{ row.is_active ? "启用" : "禁用" }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="must_change_password" label="需改密码" width="110">
        <template #default="{ row }">
          <el-tag :type="row.must_change_password? 'warning':'success'">{{ row.must_change_password ? "是" : "否" }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" min-width="170" />
      <el-table-column label="操作" min-width="260">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">权限/状态</el-button>
          <el-button size="small" type="warning" plain @click="openReset(row)">重置密码</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Create -->
    <el-dialog v-model="showCreate" title="新增用户" width="460px">
      <el-form label-width="90px">
        <el-form-item label="账号">
          <el-input v-model="form.username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width:100%">
            <el-option label="管理员" value="admin" />
            <el-option label="操作员" value="operator" />
            <el-option label="只读" value="viewer" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="createUser">保存</el-button>
      </template>
    </el-dialog>

    <!-- Edit -->
    <el-dialog v-model="showEdit" title="权限/状态" width="460px">
      <el-form label-width="90px">
        <el-form-item label="账号">
          <el-input :model-value="editing?.username" disabled />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="editRole" style="width:100%">
            <el-option label="管理员" value="admin" />
            <el-option label="操作员" value="operator" />
            <el-option label="只读" value="viewer" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="editActive" active-text="启用" inactive-text="禁用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- Reset -->
    <el-dialog v-model="showReset" title="重置密码" width="460px">
      <div style="color:#666; margin-bottom:10px">将为账号 <b>{{ editing?.username }}</b> 设置新密码，并要求下次登录修改。</div>
      <el-form label-width="90px">
        <el-form-item label="新密码">
          <el-input v-model="resetPwd" type="password" show-password />
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
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { apiGet, apiPost, apiPut } from "../api/client";

type Row = { id:number; username:string; role:"admin"|"operator"|"viewer"; is_active:number; must_change_password:number; created_at:string };

const rows = ref<Row[]>([]);
const loading = ref(false);
const saving = ref(false);

const showCreate = ref(false);
const showEdit = ref(false);
const showReset = ref(false);

const form = ref({ username:"", password:"", role:"viewer" as any });

const editing = ref<Row|null>(null);
const editRole = ref<"admin"|"operator"|"viewer">("viewer");
const editActive = ref(true);
const resetPwd = ref("");

function roleText(r: string) {
  return r==="admin" ? "管理员" : r==="operator" ? "操作员" : "只读";
}

async function load() {
  loading.value = true;
  try {
    const r = await apiGet<{ ok:boolean; data: Row[] }>("/api/users");
    rows.value = r.data;
  } catch (e:any) {
    ElMessage.error(e.message || "加载失败");
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  form.value = { username:"", password:"", role:"viewer" as any };
  showCreate.value = true;
}

async function createUser() {
  if (!form.value.username.trim()) return ElMessage.warning("请输入账号");
  if (form.value.password.length < 6) return ElMessage.warning("密码至少 6 位");
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
  showEdit.value = true;
}

async function saveEdit() {
  if (!editing.value) return;
  saving.value = true;
  try {
    await apiPut<any>("/api/users", { id: editing.value.id, role: editRole.value, is_active: editActive.value });
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
  if (resetPwd.value.length < 6) return ElMessage.warning("密码至少 6 位");
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

onMounted(load);
</script>
