<template>
  <!-- 登录/选择仓库页面：不显示侧边栏布局 -->
  <router-view v-if="simpleLayout" />

  <!-- 主布局 -->
  <div
    v-else
    class="app-root"
  >
    <div class="app-bg" />
    <el-container class="app-layout">
      <el-aside
        width="220px"
        class="app-aside"
      >
        <div style="padding: 14px; font-weight: 700">
          出入库管理
        </div>

        <!-- 系统菜单（二级菜单） -->
        <el-menu
          v-if="isSystem"
          router
          :default-active="activeMenu"
        >
          <el-menu-item index="/system/home">
            系统首页
          </el-menu-item>
          <el-menu-item index="/system/dashboard">
            报表与看板
          </el-menu-item>
          <el-menu-item index="/system/backup">
            备份/恢复
          </el-menu-item>
          <el-menu-item index="/system/audit">
            审计日志
          </el-menu-item>
          <el-menu-item index="/system/users">
            用户管理
          </el-menu-item>
          <el-menu-item index="/system/settings">
            系统配置
          </el-menu-item>
          <el-menu-item index="/system/tools">
            运维工具
          </el-menu-item>
          <el-menu-item index="/system/release-check">
            发布前检查
          </el-menu-item>
          <el-menu-item index="/system/docs">
            系统交付文档
          </el-menu-item>
        </el-menu>

        <!-- 配件仓菜单 -->
        <el-menu
          v-else-if="warehouse.active === 'parts'"
          router
          :default-active="activeMenu"
        >
          <el-menu-item index="/stock">
            库存查询
          </el-menu-item>
          <el-menu-item index="/tx">
            出入库明细
          </el-menu-item>
          <el-menu-item index="/warnings">
            预警中心
          </el-menu-item>

          <el-menu-item
            v-if="can('operator')"
            index="/in"
          >
            入库
          </el-menu-item>
          <el-menu-item
            v-if="can('operator')"
            index="/out"
          >
            出库
          </el-menu-item>
          <el-menu-item
            v-if="can('operator')"
            index="/batch"
          >
            批量出入库
          </el-menu-item>

          <el-menu-item
            v-if="can('admin')"
            index="/items"
          >
            配件管理
          </el-menu-item>
          <el-menu-item
            v-if="can('admin')"
            index="/import/items"
          >
            Excel 导入配件
          </el-menu-item>
          <el-menu-item
            v-if="can('admin')"
            index="/stocktake"
          >
            库存盘点
          </el-menu-item>
          <el-menu-item
            v-if="can('admin')"
            index="/system/home"
          >
            系统
          </el-menu-item>
        </el-menu>

        <!-- 电脑仓菜单（布局与配件仓一致，只是菜单项不同） -->
        <el-menu
          v-else
          router
          :default-active="activeMenu"
        >
          <el-menu-item index="/pc/assets">
            电脑台账
          </el-menu-item>
          <el-menu-item index="/pc/age-warnings">
            报废预警
          </el-menu-item>
          <el-menu-item index="/pc/tx">
            电脑出入库明细
          </el-menu-item>
          <el-menu-item index="/pc/inventory-logs">
            盘点记录
          </el-menu-item>
          <el-menu-item index="/pc/monitors">
            显示器台账
          </el-menu-item>
          <el-menu-item index="/pc/monitor-tx">
            显示器出入库明细
          </el-menu-item>
          <el-menu-item index="/pc/monitor-inventory-logs">
            显示器盘点记录
          </el-menu-item>
          <el-menu-item
            v-if="can('operator')"
            index="/pc/in"
          >
            电脑入库
          </el-menu-item>
          <el-menu-item
            v-if="can('operator')"
            index="/pc/out"
          >
            电脑出库
          </el-menu-item>
          <el-menu-item
            v-if="can('operator')"
            index="/pc/recycle"
          >
            电脑回收/归还
          </el-menu-item>
          <el-menu-item
            v-if="can('admin')"
            index="/system/home"
          >
            系统
          </el-menu-item>
        </el-menu>

        <div style="padding: 12px; color: #999; font-size: 12px">
          当前：{{ isSystem ? "系统" : (warehouse.active === "pc" ? "电脑仓" : "配件仓") }}
        </div>
      </el-aside>

      <el-container class="app-content">
        <el-header class="app-header">
          <div style="display:flex; align-items:center; gap:10px">
            <div style="font-weight: 700">
              {{ title }}
            </div>

            <el-button-group>
              <el-button
                size="small"
                :type="currentArea==='parts' ? 'primary' : 'default'"
                @click="switchTo('parts')"
              >
                配件仓
              </el-button>
              <el-button
                size="small"
                :type="currentArea==='pc' ? 'primary' : 'default'"
                @click="switchTo('pc')"
              >
                电脑仓
              </el-button>
              <el-button
                v-if="can('admin')"
                size="small"
                :type="currentArea==='system' ? 'primary' : 'default'"
                @click="switchToSystem"
              >
                系统
              </el-button>
            </el-button-group>
          </div>

          <div style="display: flex; gap: 8px; align-items: center">
            <div
              v-if="auth.user"
              style="color: #666"
            >
              {{ auth.user.username }}（{{ roleText(auth.user.role) }}）
            </div>
            <el-button
              size="small"
              @click="goChangePwd"
            >
              改密码
            </el-button>
            <el-button
              size="small"
              type="danger"
              plain
              @click="doLogout"
            >
              退出
            </el-button>
          </div>
        </el-header>

        <el-main class="app-main">
          <div class="page-wrap">
            <el-alert v-if="schemaStatus.loaded && !schemaStatus.ok" type="error" :closable="false" show-icon style="margin-bottom:12px" :title="schemaStatus.message || '数据库结构未升级到当前版本，请先执行迁移'" />
            <el-alert
              v-if="opsAlert.visible"
              :type="opsAlert.type"
              :closable="false"
              show-icon
              style="margin-bottom:12px"
            >
              <template #title>
                <div style="display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap">
                  <div>{{ opsAlert.title }}</div>
                  <div style="display:flex; gap:8px; flex-wrap:wrap">
                    <el-button size="small" @click="router.push('/system/tools')">打开运维工具</el-button>
                    <el-button size="small" plain @click="router.push('/system/release-check')">打开发布前检查</el-button>
                  </div>
                </div>
              </template>
              <div>{{ opsAlert.detail }}</div>
            </el-alert>
            <router-view />
          </div>
        </el-main>
      </el-container>
    </el-container>

    <el-dialog
      v-model="showChange"
      title="修改密码"
      width="420px"
    >
      <el-form>
        <el-form-item label="旧密码">
          <el-input
            v-model="oldP"
            type="password"
            show-password
          />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input
            v-model="newP"
            type="password"
            show-password
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showChange = false">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="changing"
          @click="changePwd"
        >
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "./utils/el-services";
import { apiPost } from "./api/client";
import { getSystemHealth, getSystemSchemaStatus } from "./api/systemHealth";
import { can, logout, useAuth } from "./store/auth";
import { setWarehouse, useWarehouse, WarehouseKey, clearWarehouse } from "./store/warehouse";

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const warehouse = useWarehouse();

const isSystem = computed(() => route.path.startsWith("/system"));

const currentArea = computed(() => {
  if (isSystem.value) return "system";
  return warehouse.active === "pc" ? "pc" : "parts";
});

const simpleLayout = computed(() => (route.meta as any)?.public || route.path === "/login" || route.path === "/warehouses");

const activeMenu = computed(() => route.path);

const title = computed(() => {
  // 系统模块：优先用路由 meta.title
  if (isSystem.value) {
    const t = (route.meta as any)?.title as string | undefined;
    return t || "系统";
  }

  // 电脑仓：优先用路由 meta.title
  if (warehouse.active === "pc") {
    const t = (route.meta as any)?.title as string | undefined;
    if (t) return t;
    const map: Record<string, string> = {
      "/pc/assets": "电脑台账",
      "/pc/monitors": "显示器台账",
      "/pc/age-warnings": "报废预警",
      "/pc/tx": "电脑出入库明细",
      "/pc/monitor-tx": "显示器出入库明细",
      "/pc/inventory-logs": "盘点记录",
      "/pc/monitor-inventory-logs": "显示器盘点记录",
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
  if (!k) return;
  // 在系统页面也允许跳回仓库，即使当前 activeWarehouse 与目标一致
  if (!isSystem.value && warehouse.active === k) return;
  setWarehouse(k);
  router.push(k === "pc" ? "/pc/assets" : "/stock");
}

function switchToSystem() {
  router.push("/system/home");
}

function doLogout() {
  logout();
  clearWarehouse();
  router.replace("/login");
}

const showChange = ref(false);
const schemaStatus = reactive<{ loaded: boolean; ok: boolean; message: string; required_version?: string; current_version?: string }>({ loaded: false, ok: true, message: '' });
const opsAlert = reactive<{ visible: boolean; type: 'warning' | 'error'; title: string; detail: string }>({ visible: false, type: 'warning', title: '', detail: '' });

async function loadSchemaStatus() {
  if (!auth.user || simpleLayout.value) return;
  try {
    const r:any = await getSystemSchemaStatus();
    schemaStatus.loaded = true;
    schemaStatus.ok = !!r.data?.ok;
    schemaStatus.message = String(r.data?.message || '');
    schemaStatus.required_version = r.data?.required_version;
    schemaStatus.current_version = r.data?.current_version;
  } catch (e:any) {
    schemaStatus.loaded = true;
    schemaStatus.ok = true;
    schemaStatus.message = '';
  }
}

async function loadOpsAlert() {
  if (!auth.user || simpleLayout.value || auth.user.role !== 'admin') {
    opsAlert.visible = false;
    return;
  }
  try {
    const r:any = await getSystemHealth();
    const alerts = r.data?.alerts || {};
    const active = Number(alerts.active_count || 0);
    if (!active) {
      opsAlert.visible = false;
      return;
    }
    const parts:string[] = [];
    if (alerts.schema_issue) parts.push('Schema 未就绪');
    if (alerts.scan_issue) parts.push(`巡检发现 ${Number(r.data?.scan?.total_problem_count || 0)} 类问题`);
    if (Number(alerts.failed_jobs || 0) > 0) parts.push(`失败异步任务 ${Number(alerts.failed_jobs || 0)} 个`);
    if (Number(alerts.error_5xx_last_24h || 0) > 0) parts.push(`近 24h 发生 ${Number(alerts.error_5xx_last_24h || 0)} 次 5xx`);
    opsAlert.visible = true;
    opsAlert.type = alerts.schema_issue ? 'error' : 'warning';
    opsAlert.title = `系统当前有 ${active} 项主动告警`;
    opsAlert.detail = parts.join('；');
  } catch {
    opsAlert.visible = false;
  }
}

watch(() => [route.path, auth.user?.id], () => { loadSchemaStatus(); loadOpsAlert(); }, { immediate: true });

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
    await apiPost<any>("/api/auth/change-password", { old_password: oldP.value, new_password: newP.value });
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
