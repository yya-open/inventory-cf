<template>
  <!-- 登录/选择仓库页面：不显示侧边栏布局 -->
  <router-view v-if="simpleLayout" />

  <!-- 主布局 -->
  <el-container v-else style="height: 100vh">
    <el-aside width="220px" style="border-right: 1px solid #eee">
      <div style="padding: 14px; font-weight: 700">出入库管理</div>

      <!-- 配件仓菜单 -->
      <el-menu v-if="warehouse.active === 'parts'" router :default-active="activeMenu">
        <el-menu-item index="/stock">库存查询</el-menu-item>
        <el-menu-item index="/tx">出入库明细</el-menu-item>
        <el-menu-item index="/warnings">预警中心</el-menu-item>
        <el-menu-item index="/dashboard">报表与看板</el-menu-item>

        <el-menu-item v-if="can('operator')" index="/in">入库</el-menu-item>
        <el-menu-item v-if="can('operator')" index="/out">出库</el-menu-item>
        <el-menu-item v-if="can('operator')" index="/batch">批量出入库</el-menu-item>

        <el-menu-item v-if="can('admin')" index="/items">配件管理</el-menu-item>
        <el-menu-item v-if="can('admin')" index="/import/items">Excel 导入</el-menu-item>
        <el-menu-item v-if="can('admin')" index="/backup">备份/恢复</el-menu-item>
        <el-menu-item v-if="can('admin')" index="/audit">审计日志</el-menu-item>
        <el-menu-item v-if="can('admin')" index="/users">用户管理</el-menu-item>
        <el-menu-item v-if="can('admin')" index="/stocktake">库存盘点</el-menu-item>
      </el-menu>

      <!-- 电脑仓菜单（布局与配件仓一致，只是菜单项不同） -->
      <el-menu v-else router :default-active="activeMenu">
        <el-menu-item index="/pc/assets">电脑台账</el-menu-item>
        <el-menu-item index="/pc/tx">电脑出入库明细</el-menu-item>
        <el-menu-item v-if="can('operator')" index="/pc/in">电脑入库</el-menu-item>
        <el-menu-item v-if="can('operator')" index="/pc/out">电脑出库</el-menu-item>
        <el-menu-item v-if="can('operator')" index="/pc/recycle">电脑回收/归还</el-menu-item>
      </el-menu>

      <div style="padding: 12px; color: #999; font-size: 12px">
        当前仓库：{{ warehouse.active === "pc" ? "电脑仓" : "配件仓" }}
      </div>
    </el-aside>

    <el-container>
      <el-header
        style="border-bottom: 1px solid #eee; display: flex; align-items: center; justify-content: space-between"
      >
        <div style="display:flex; align-items:center; gap:10px">
          <div style="font-weight: 700">{{ title }}</div>

          <el-button-group>
            <el-button size="small" :type="warehouse.active==='parts' ? 'primary' : 'default'" @click="switchTo('parts')">
              配件仓
            </el-button>
            <el-button size="small" :type="warehouse.active==='pc' ? 'primary' : 'default'" @click="switchTo('pc')">
              电脑仓
            </el-button>
          </el-button-group>
        </div>

        <div style="display: flex; gap: 8px; align-items: center">
          <div v-if="auth.user" style="color: #666">
            {{ auth.user.username }}（{{ roleText(auth.user.role) }}）
          </div>
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
        <el-button @click="showChange = false">取消</el-button>
        <el-button type="primary" :loading="changing" @click="changePwd">确定</el-button>
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
import { setWarehouse, useWarehouse, WarehouseKey, clearWarehouse } from "./store/warehouse";

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const warehouse = useWarehouse();

const simpleLayout = computed(() => route.path === "/login" || route.path === "/warehouses");

const activeMenu = computed(() => route.path);

const title = computed(() => {
  // 电脑仓：优先用路由 meta.title
  if (warehouse.active === "pc") {
    const t = (route.meta as any)?.title as string | undefined;
    if (t) return t;
    const map: Record<string, string> = {
      "/pc/assets": "电脑台账",
      "/pc/tx": "电脑出入库明细",
      "/pc/in": "电脑入库",
      "/pc/out": "电脑出库",
      "/pc/recycle": "电脑回收/归还",
    };
    return map[route.path] || "电脑仓";
  }

  // 配件仓
  const map: Record<string, string> = {
    "/stock": "库存查询",
    "/in": "入库",
    "/out": "出库",
    "/tx": "出入库明细",
    "/warnings": "预警中心",
    "/dashboard": "报表与看板",
    "/items": "配件管理",
    "/import/items": "Excel 导入配件",
    "/backup": "备份/恢复",
    "/audit": "审计日志",
    "/users": "用户管理",
    "/stocktake": "库存盘点",
    "/batch": "批量出入库",
  };
  return map[route.path] || "系统";
});

function roleText(r: string) {
  return r === "admin" ? "管理员" : r === "operator" ? "操作员" : "只读";
}

function switchTo(k: WarehouseKey) {
  if (!k || warehouse.active === k) return;
  setWarehouse(k);
  router.push(k === "pc" ? "/pc/assets" : "/stock");
}

function doLogout() {
  logout();
  clearWarehouse();
  router.replace("/login");
}

const showChange = ref(false);
const oldP = ref("");
const newP = ref("");
const changing = ref(false);

function goChangePwd() {
  showChange.value = true;
  oldP.value = "";
  newP.value = "";
}

async function changePwd() {
  if (newP.value.length < 6) return ElMessage.warning("新密码至少 6 位");
  changing.value = true;
  try {
    await apiPost<any>("/api/change_password", { old_password: oldP.value, new_password: newP.value });
    ElMessage.success("修改成功，请重新登录");
    doLogout();
  } catch (e: any) {
    ElMessage.error(e.message || "修改失败");
  } finally {
    changing.value = false;
    showChange.value = false;
  }
}
</script>
