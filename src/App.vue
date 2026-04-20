<template>
  <!-- 登录/选择仓库页面：不显示侧边栏布局 -->
  <router-view v-if="simpleLayout" />

  <!-- 主布局 -->
  <div
    v-else
    class="app-root"
    :class="{ 'app-root--mobile': isMobile }"
    :style="{ '--sidebar-width': desktopSidebarWidth }"
  >
    <div class="app-bg" />
    <el-container class="app-layout" :class="{ 'app-layout--sidebar-collapsed': desktopSidebarCollapsed && !desktopSidebarPreview, 'app-layout--sidebar-preview': desktopSidebarPreview, 'app-layout--mobile': isMobile }">
      <el-aside
        v-if="!isMobile"
        :width="desktopSidebarWidth"
        class="app-aside"
        :class="{ 'app-aside--collapsed': !desktopSidebarVisible, 'app-aside--preview': desktopSidebarPreview }"
        @mouseenter="markSidebarHovered(true)"
        @mouseleave="markSidebarHovered(false)"
      >
        <div class="app-aside__inner">
          <AppSidebarMenu
            :is-system="isSystem"
            :active-menu="activeMenu"
            :warehouse-active="sidebarWarehouseActive"
            :can-access-parts-area="canAccessPartsArea"
            :can-access-pc-area="canAccessPcArea"
            :can-access-pc-ledger="canAccessPcLedger"
            :can-access-monitor-ledger="canAccessMonitorLedger"
            :can-operator="can('operator')"
            :is-admin="can('admin')"
            :collapsed="desktopSidebarCollapsed"
            @toggle-collapse="toggleSidebar"
          />
        </div>
      </el-aside>

      <el-drawer
        v-if="isMobile"
        v-model="mobileSidebarVisible"
        direction="ltr"
        size="82%"
        :with-header="false"
        :append-to-body="true"
        class="app-mobile-drawer"
      >
        <div class="app-mobile-drawer__header">
          <div class="app-mobile-drawer__title">导航菜单</div>
          <el-button circle plain class="app-mobile-drawer__close" @click="mobileSidebarVisible = false">×</el-button>
        </div>
        <AppSidebarMenu
          :is-system="isSystem"
          :active-menu="activeMenu"
          :warehouse-active="sidebarWarehouseActive"
          :can-access-parts-area="canAccessPartsArea"
          :can-access-pc-area="canAccessPcArea"
          :can-access-pc-ledger="canAccessPcLedger"
          :can-access-monitor-ledger="canAccessMonitorLedger"
          :can-operator="can('operator')"
          :is-admin="can('admin')"
          :is-mobile="true"
        />
      </el-drawer>

      <el-container class="app-content">
        <el-header class="app-header">
          <div class="app-header__main">
            <el-button
              v-if="isMobile"
              class="app-header__menu"
              circle
              @click="mobileSidebarVisible = true"
            >
              ☰
            </el-button>
            <div class="app-header__title-group">
            <div class="app-header__title">
              {{ title }}
            </div>

            <el-button-group class="app-header__switches">
              <el-button
                v-if="canAccessPartsArea"
                size="small"
                :type="currentArea==='parts' ? 'primary' : 'default'"
                @click="switchTo('parts')"
              >
                配件仓
              </el-button>
              <el-button
                v-if="canAccessPcArea"
                size="small"
                :type="currentArea==='pc' ? 'primary' : 'default'"
                @click="switchTo('pc')"
              >
                {{ canAccessPcLedger && canAccessMonitorLedger ? '电脑/显示器仓' : (canAccessPcLedger ? '电脑仓' : '显示器仓') }}
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
          </div>

          <div class="app-header__actions">
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
            <div v-if="showRouteSkeleton" class="app-page-skeleton" aria-hidden="true">
              <div class="app-page-skeleton__toolbar">
                <div class="app-page-skeleton__panel">
                  <div class="app-page-skeleton__kicker" />
                  <div class="app-page-skeleton__title" />
                  <div class="app-page-skeleton__text" />
                  <div class="app-page-skeleton__controls">
                    <span class="app-page-skeleton__control app-page-skeleton__control--wide" />
                    <span class="app-page-skeleton__control app-page-skeleton__control--mid" />
                    <span class="app-page-skeleton__control app-page-skeleton__control--cta" />
                    <span class="app-page-skeleton__control app-page-skeleton__control--short" />
                  </div>
                </div>
                <div class="app-page-skeleton__panel app-page-skeleton__panel--side">
                  <div class="app-page-skeleton__badge" />
                  <div class="app-page-skeleton__title app-page-skeleton__title--short" />
                  <div class="app-page-skeleton__text app-page-skeleton__text--short" />
                  <div class="app-page-skeleton__button-row">
                    <span class="app-page-skeleton__button app-page-skeleton__button--primary" />
                    <span class="app-page-skeleton__button" />
                    <span class="app-page-skeleton__button" />
                  </div>
                </div>
              </div>
              <div class="app-page-skeleton__table">
                <div class="app-page-skeleton__table-head" />
                <div v-for="index in 6" :key="index" class="app-page-skeleton__table-row">
                  <span class="app-page-skeleton__cell app-page-skeleton__cell--short" />
                  <span class="app-page-skeleton__cell app-page-skeleton__cell--wide" />
                  <span class="app-page-skeleton__cell" />
                  <span class="app-page-skeleton__cell" />
                  <span class="app-page-skeleton__cell app-page-skeleton__cell--mid" />
                </div>
              </div>
            </div>
            <div class="page-wrap__content" :class="{ 'page-wrap__content--pending': showRouteSkeleton }">
              <router-view v-slot="{ Component }">
                <keep-alive :include="cachedViewNames" :max="16">
                  <component :is="Component" />
                </keep-alive>
              </router-view>
            </div>
          </div>
        </el-main>
      </el-container>
    </el-container>

    <el-dialog
      v-model="showChange"
      title="修改密码"
      :width="isMobile ? 'calc(100vw - 24px)' : '420px'"
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
import { computed, ref, reactive, watch, onMounted, onBeforeUnmount } from "vue";
import AppSidebarMenu from "./components/AppSidebarMenu.vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "./utils/el-services";
import { apiPost } from "./api/client";
import { getSystemHealth, getSystemSchemaStatus } from "./api/systemHealth";
import { can, logout, useAuth } from "./store/auth";
import { routePageSkeletonVisible } from "./router";
import { setWarehouse, useWarehouse, WarehouseKey, clearWarehouse } from "./store/warehouse";
import { canAccessModuleArea, canAccessPcSection, preferredPcRoute } from "./utils/moduleAccess";
import { installGlobalTableScrollEnhancer } from "./utils/globalTableScroll";
import { trackUiEvent } from "./utils/browserPerf";
import { isAppMobileViewport } from "./utils/responsive";

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const warehouse = useWarehouse();

const isSystem = computed(() => route.path.startsWith("/system"));

const canAccessPartsArea = computed(() => canAccessModuleArea(auth.user, "parts"));
const canAccessPcArea = computed(() => canAccessModuleArea(auth.user, "pc"));
const canAccessPcLedger = computed(() => canAccessPcSection(auth.user, "pc"));
const canAccessMonitorLedger = computed(() => canAccessPcSection(auth.user, "monitor"));

const currentArea = computed<"parts" | "pc" | "system">(() => {
  if (isSystem.value) return "system";
  if (warehouse.active === "pc") return "pc";
  return "parts";
});

const sidebarWarehouseActive = computed<"parts" | "pc">(() => (warehouse.active === "pc" ? "pc" : "parts"));

const simpleLayout = computed(() => (route.meta as any)?.public || route.path === "/login" || route.path === "/warehouses");
const showRouteSkeleton = computed(() => !simpleLayout.value && routePageSkeletonVisible.value);

const SIDEBAR_COLLAPSED_KEY = "inventory_sidebar_collapsed";
const desktopSidebarCollapsed = ref(false);
const desktopSidebarPreview = ref(false);
const sidebarHovered = ref(false);
const sidebarToggleHovered = ref(false);
const isMobile = ref(false);
const mobileSidebarVisible = ref(false);

const activeMenu = computed(() => route.path);
const desktopSidebarVisible = computed(() => !desktopSidebarCollapsed.value || desktopSidebarPreview.value);
const desktopSidebarWidth = computed(() => {
  if (isMobile.value) return '0px';
  if (desktopSidebarCollapsed.value && !desktopSidebarPreview.value) return '72px';
  return '220px';
});

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
  if (k === "parts" && !canAccessPartsArea.value) return;
  if (k === "pc" && !canAccessPcArea.value) return;
  // 在系统页面也允许跳回仓库，即使当前 activeWarehouse 与目标一致
  if (!isSystem.value && warehouse.active === k) return;
  setWarehouse(k);
  router.push(k === "pc" ? preferredPcRoute(auth.user) : "/stock");
}

function switchToSystem() {
  router.push("/system/home");
}

async function doLogout() {
  await logout();
  clearWarehouse();
  router.replace("/login");
}

const showChange = ref(false);
const cachedViewNames = ['StockQuery', 'TxList', 'Warnings', 'PcAssets', 'MonitorAssets', 'PcAgeWarnings', 'PcTx', 'MonitorTx', 'PcInventoryLogs', 'MonitorInventoryLogs'];
const needsSystemMeta = computed(() => ['/system/home', '/system/tools', '/system/release-check', '/system/dashboard'].includes(route.path));
const schemaStatus = reactive<{ loaded: boolean; ok: boolean; message: string; required_version?: string; current_version?: string }>({ loaded: false, ok: true, message: '' });
const opsAlert = reactive<{ visible: boolean; type: 'warning' | 'error'; title: string; detail: string }>({ visible: false, type: 'warning', title: '', detail: '' });

let removeGlobalTableScrollEnhancer: (() => void) | null = null;
onMounted(() => {
  removeGlobalTableScrollEnhancer = installGlobalTableScrollEnhancer();
  try {
    desktopSidebarCollapsed.value = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    updateViewport();
    window.addEventListener("resize", updateViewport, { passive: true });
  } catch {}
});
onBeforeUnmount(() => {
  removeGlobalTableScrollEnhancer?.();
  removeGlobalTableScrollEnhancer = null;
  window.removeEventListener("resize", updateViewport);
});

watch(desktopSidebarCollapsed, (value, previous) => {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, value ? "1" : "0");
  } catch {}
  if (value === previous) return;
  if (!value) desktopSidebarPreview.value = false;
  trackUiEvent('sidebar_toggle', {
    path: route.path,
    fullPath: route.fullPath,
    metadata: {
      collapsed: value,
      area: currentArea.value,
      source: 'desktop-toggle',
    },
    urgent: true,
  });
});

function updateViewport() {
  const nextMobile = isAppMobileViewport();
  isMobile.value = nextMobile;
  if (!nextMobile) mobileSidebarVisible.value = false;
}

function handleSidebarToggleHover(next: boolean) {
  sidebarToggleHovered.value = next;
  if (next) openSidebarPreview();
}

function openSidebarPreview() {
  if (isMobile.value || !desktopSidebarCollapsed.value || desktopSidebarPreview.value) return;
  desktopSidebarPreview.value = true;
  trackUiEvent('sidebar_preview_open', {
    path: route.path,
    fullPath: route.fullPath,
    metadata: { area: currentArea.value },
  });
}

function markSidebarHovered(next: boolean) {
  sidebarHovered.value = next;
  if (!next && desktopSidebarCollapsed.value && desktopSidebarPreview.value) {
    sidebarToggleHovered.value = false;
    window.setTimeout(() => {
      if (!sidebarHovered.value && desktopSidebarCollapsed.value) {
        desktopSidebarPreview.value = false;
      }
    }, 120);
  }
}

function toggleSidebar() {
  if (isMobile.value) {
    mobileSidebarVisible.value = !mobileSidebarVisible.value;
    trackUiEvent('mobile_sidebar_toggle', {
      path: route.path,
      fullPath: route.fullPath,
      metadata: { open: mobileSidebarVisible.value, area: currentArea.value },
    });
    return;
  }
  desktopSidebarCollapsed.value = !desktopSidebarCollapsed.value;
}

watch(() => route.fullPath, () => {
  mobileSidebarVisible.value = false;
  sidebarToggleHovered.value = false;
  if (desktopSidebarCollapsed.value) desktopSidebarPreview.value = false;
});

watch(simpleLayout, (value) => {
  if (value) mobileSidebarVisible.value = false;
});

async function loadSchemaStatus() {
  if (!auth.user || simpleLayout.value || !needsSystemMeta.value) {
    schemaStatus.loaded = false;
    schemaStatus.ok = true;
    schemaStatus.message = '';
    return;
  }
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
  if (!auth.user || simpleLayout.value || auth.user.role !== 'admin' || !needsSystemMeta.value) {
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

watch(() => [route.path, auth.user?.id, needsSystemMeta.value], () => { loadSchemaStatus(); loadOpsAlert(); }, { immediate: true });

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
