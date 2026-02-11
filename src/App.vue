<template>
  <el-container style="height: 100vh">
    <el-aside width="220px" style="border-right: 1px solid #eee">
      <div style="padding: 14px; font-weight: 700">出入库管理</div>
      <el-menu router :default-active="$route.path">
        <el-menu-item index="/stock">库存查询</el-menu-item>
        <el-menu-item index="/tx">出入库明细</el-menu-item>
        <el-menu-item index="/warnings">预警中心</el-menu-item>
        <el-menu-item index="/dashboard">报表与看板</el-menu-item>

        <el-menu-item index="/pc/assets">电脑台账（仓库2）</el-menu-item>
        <el-menu-item index="/pc/tx">电脑出入库明细</el-menu-item>

        <el-menu-item v-if="can('operator')" index="/in">入库</el-menu-item>
        <el-menu-item v-if="can('operator')" index="/out">出库</el-menu-item>
        <el-menu-item v-if="can('operator')" index="/pc/in">电脑入库</el-menu-item>
        <el-menu-item v-if="can('operator')" index="/pc/out">电脑出库</el-menu-item>
        <el-menu-item v-if="can('operator')" index="/pc/recycle">电脑回收/归还</el-menu-item>
        <el-menu-item v-if="can('operator')" index="/batch">批量出入库</el-menu-item>

        <el-menu-item v-if="can('admin')" index="/items">配件管理</el-menu-item>
        <el-menu-item v-if="can('admin')" index="/import/items">Excel 导入</el-menu-item>
        <el-menu-item v-if="can('admin')" index="/backup">备份/恢复</el-menu-item>
        <el-menu-item v-if="can('admin')" index="/audit">审计日志</el-menu-item>
        <el-menu-item v-if="can('admin')" index="/users">用户管理</el-menu-item>
        <el-menu-item v-if="can('admin')" index="/stocktake">库存盘点</el-menu-item>
      </el-menu>
      <div style="padding: 12px; color: #999; font-size: 12px">
        默认仓库：主仓（id=1）/ 电脑仓（id=2）
      </div>
    </el-aside>

    <el-container>
      <el-header
        style="border-bottom: 1px solid #eee; display: flex; align-items: center; justify-content: space-between"
      >
        <div style="font-weight: 600">{{ title }}</div>
        <div style="display:flex; align-items:center; gap:10px">
          <el-tag v-if="auth.user" :type="auth.user.role==='admin'?'danger':auth.user.role==='operator'?'warning':'info'">
            {{ auth.user.username }} · {{ roleText(auth.user.role) }}
          </el-tag>
          <el-button size="small" @click="goChangePwd">改密码</el-button>
          <el-button size="small" type="danger" plain @click="doLogout">退出</el-button>
        </div>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>

    <el-dialog v-model="showChange" title="修改密码" width="420px">
      <el-form>
        <el-form-item label="旧密码">
          <el-input v-model="oldP" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="newP" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showChange=false">取消</el-button>
        <el-button type="primary" :loading="changing" @click="changePwd">确认</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { apiPost } from "./api/client";
import { can, logout, useAuth } from "./store/auth";

const route = useRoute();
const router = useRouter();
const auth = useAuth();

const title = computed(() => {
  const map: Record<string, string> = {
    "/stock": "库存查询",
    "/in": "入库",
    "/out": "出库",
    "/tx": "出入库明细",
    "/warnings": "预警中心",
    "/dashboard": "报表与看板",

    "/pc/assets": "电脑台账（仓库2）",
    "/pc/tx": "电脑出入库明细",
    "/pc/in": "电脑入库",
    "/pc/out": "电脑出库",

    "/items": "配件管理",
    "/import/items": "Excel 导入配件",
    "/backup": "备份/恢复",
    "/audit": "审计日志",
    "/users": "用户管理",
    "/stocktake": "库存盘点",
  };
  return map[route.path] || "系统";
});

function roleText(r: string) {
  return r === "admin" ? "管理员" : r === "operator" ? "操作员" : "只读";
}

function doLogout() {
  logout();
  router.replace("/login");
}

const showChange = ref(false);
const oldP = ref("");
const newP = ref("");
const changing = ref(false);

function goChangePwd() {
  oldP.value = "";
  newP.value = "";
  showChange.value = true;
}

async function changePwd() {
  if (newP.value.length < 6) return ElMessage.warning("新密码至少 6 位");
  changing.value = true;
  try {
    await apiPost<any>("/api/auth/change-password", { old_password: oldP.value, new_password: newP.value });
    ElMessage.success("密码已更新，请重新登录");
    doLogout();
  } catch (e: any) {
    ElMessage.error(e.message || "修改失败");
  } finally {
    changing.value = false;
  }
}
</script>
