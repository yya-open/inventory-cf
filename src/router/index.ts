import { createRouter, createWebHistory } from "vue-router";
import { ref } from "vue";
import StockQuery from "../views/StockQuery.vue";
const StockIn = () => import("../views/StockIn.vue");
const StockOut = () => import("../views/StockOut.vue");
import TxList from "../views/TxList.vue";
import Warnings from "../views/Warnings.vue";
const BatchTx = () => import("../views/BatchTx.vue");
const Stocktake = () => import("../views/Stocktake.vue");
const Dashboard = () => import("../views/Dashboard.vue");
const Items = () => import("../views/Items.vue");
const Login = () => import("../views/Login.vue");
const WarehouseSelect = () => import("../views/WarehouseSelect.vue");
const Users = () => import("../views/Users.vue");
const AuditLog = () => import("../views/AuditLog.vue");
const BackupRestore = () => import("../views/BackupRestore.vue");
const ImportItems = () => import("../views/ImportItems.vue");
const PcOut = () => import("../views/PcOut.vue");
const PcIn = () => import("../views/PcIn.vue");
import PcTx from "../views/PcTx.vue";
const PcRecycle = () => import("../views/PcRecycle.vue");
import PcAssets from "../views/PcAssets.vue";
import PcWarehouse from "../views/PcWarehouse.vue";
import PcAgeWarnings from "../views/PcAgeWarnings.vue";
import PcInventoryLogs from "../views/PcInventoryLogs.vue";
import MonitorInventoryLogs from "../views/MonitorInventoryLogs.vue";
import MonitorAssets from "../views/MonitorAssets.vue";
import MonitorTx from "../views/MonitorTx.vue";
import SystemHome from "../views/SystemHome.vue";
import SystemSettings from "../views/SystemSettings.vue";
import SystemTaskCenter from "../views/SystemTaskCenter.vue";
import SystemReportsCenter from "../views/SystemReportsCenter.vue";
import SystemOpsTools from "../views/SystemOpsTools.vue";
import SystemPerformance from "../views/SystemPerformance.vue";
import SystemReleaseCheck from "../views/SystemReleaseCheck.vue";
import SystemDocs from "../views/SystemDocs.vue";
import SystemLayout from "../views/SystemLayout.vue";
const PublicPcAsset = () => import("../views/PublicPcAsset.vue");
const PublicMonitorAsset = () => import("../views/PublicMonitorAsset.vue");
import { fetchMe, hydrateAuthFromCache, shouldRefreshAuthInBackground, useAuth, can } from "../store/auth";
import { useWarehouse, setWarehouse } from "../store/warehouse";
import { ElMessage } from "../utils/el-services";
import { scheduleOnIdle } from "../utils/idle";
import { clearPrefetchedRouteChunk, hasPrefetchedRouteChunk, markPrefetchedRouteChunk, shouldAllowRoutePrefetch } from "../utils/routePrefetch";
import { canAccessModuleArea, canAccessPcSection, firstAccessibleArea, firstAccessibleRoute, isMonitorOnlyRoute, isPartsModuleRoute, isPcModuleRoute, isPcOnlyRoute, preferredPcRoute } from "../utils/moduleAccess";

export const routePagePending = ref(false);
export const routePageSkeletonVisible = ref(false);
let routePageSkeletonTimer: ReturnType<typeof setTimeout> | null = null;
let firstRouteResolved = false;

function startRoutePagePending() {
  routePagePending.value = true;
  if (routePageSkeletonTimer) {
    clearTimeout(routePageSkeletonTimer);
    routePageSkeletonTimer = null;
  }
  if (!firstRouteResolved) {
    routePageSkeletonVisible.value = true;
    return;
  }
  routePageSkeletonTimer = setTimeout(() => {
    if (routePagePending.value) routePageSkeletonVisible.value = true;
  }, 80);
}

function finishRoutePagePending() {
  routePagePending.value = false;
  if (routePageSkeletonTimer) {
    clearTimeout(routePageSkeletonTimer);
    routePageSkeletonTimer = null;
  }
  routePageSkeletonVisible.value = false;
  firstRouteResolved = true;
}

const preloadPcAssets = () => Promise.resolve(PcAssets);
const preloadMonitorAssets = () => Promise.resolve(MonitorAssets);
const preloadPcAgeWarnings = () => Promise.resolve(PcAgeWarnings);
const preloadPcTx = () => Promise.resolve(PcTx);
const preloadMonitorTx = () => Promise.resolve(MonitorTx);
const preloadPcInventoryLogs = () => Promise.resolve(PcInventoryLogs);
const preloadMonitorInventoryLogs = () => Promise.resolve(MonitorInventoryLogs);

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // 登录后默认进入“配件仓”首页
    { path: "/", redirect: "/stock" },
    { path: "/login", component: Login, meta: { public: true } },
    // 扫码查看电脑信息（无需登录）
    { path: "/public/pc-asset", component: PublicPcAsset, meta: { public: true } },
    // 扫码查看显示器信息（无需登录）
    { path: "/public/monitor-asset", component: PublicMonitorAsset, meta: { public: true } },
    { path: "/warehouses", component: WarehouseSelect, meta: { role: "viewer" } },

    { path: "/stock", component: StockQuery, meta: { role: "viewer" } },
    { path: "/tx", component: TxList, meta: { role: "viewer" } },
    { path: "/warnings", component: Warnings, meta: { role: "viewer" } },

    // 报表与看板：收纳到系统模块下（保留旧路径兼容跳转）
    { path: "/dashboard", redirect: "/system/dashboard" },

    // 系统模块：进入后左侧切换为系统菜单（二级菜单）
    {
      path: "/system",
      component: SystemLayout,
      redirect: "/system/home",
      meta: { role: "admin", title: "系统" },
      children: [
        { path: "home", component: SystemHome, meta: { role: "admin", title: "系统" } },
        { path: "dashboard", component: Dashboard, meta: { role: "admin", title: "报表与看板" } },
        { path: "reports", component: SystemReportsCenter, meta: { role: "admin", title: "数据报表中心" } },
        { path: "tasks", component: SystemTaskCenter, meta: { role: "admin", title: "批量任务中心" } },
        { path: "import", redirect: "/import/items", meta: { role: "admin", title: "Excel 导入配件" } },
        { path: "backup", component: BackupRestore, meta: { role: "admin", title: "备份/恢复" } },
        { path: "audit", component: AuditLog, meta: { role: "admin", title: "审计日志" } },
        { path: "users", component: Users, meta: { role: "admin", title: "用户管理" } },
        { path: "settings", component: SystemSettings, meta: { role: "admin", title: "系统配置" } },
        { path: "tools", component: SystemOpsTools, meta: { role: "admin", title: "运维工具" } },
        { path: "release-check", component: SystemReleaseCheck, meta: { role: "admin", title: "发布前检查" } },
        { path: "performance", component: SystemPerformance, meta: { role: "admin", title: "性能面板" } },
        { path: "docs", component: SystemDocs, meta: { role: "admin", title: "系统交付文档" } },
      ],
    },

    // 仓库2（电脑仓）使用一个入口 /pc，并在页面内 Tab 切换子功能
    {
      path: "/pc",
      component: PcWarehouse,
      redirect: "/pc/assets",
      meta: { role: "viewer", title: "电脑仓（仓库2）" },
      children: [
        { path: "assets", component: PcAssets, meta: { role: "viewer", title: "电脑台账" } },
        { path: "monitors", component: MonitorAssets, meta: { role: "viewer", title: "显示器台账" } },
        { path: "age-warnings", component: PcAgeWarnings, meta: { role: "viewer", title: "报废预警" } },
        { path: "tx", component: PcTx, meta: { role: "viewer", title: "出入库明细" } },
        { path: "monitor-tx", component: MonitorTx, meta: { role: "viewer", title: "显示器出入库明细" } },
        { path: "inventory-logs", component: PcInventoryLogs, meta: { role: "viewer", title: "盘点记录" } },
        { path: "monitor-inventory-logs", component: MonitorInventoryLogs, meta: { role: "viewer", title: "显示器盘点记录" } },
        { path: "in", component: PcIn, meta: { role: "operator", title: "电脑入库" } },
        { path: "out", component: PcOut, meta: { role: "operator", title: "电脑出库" } },
        { path: "recycle", component: PcRecycle, meta: { role: "operator", title: "回收/归还" } },
      ],
    },

    { path: "/batch", component: BatchTx, meta: { role: "operator" } },
    { path: "/stocktake", component: Stocktake, meta: { role: "admin" } },

    { path: "/in", component: StockIn, meta: { role: "operator" } },
    { path: "/out", component: StockOut, meta: { role: "operator" } },

    // 兼容旧链接：系统功能旧路径全部跳转到 /system/*
    { path: "/backup", redirect: "/system/backup" },
    { path: "/import/items", component: ImportItems, meta: { role: "admin", title: "Excel 导入配件" } },
    { path: "/system/import", redirect: "/import/items" },
    { path: "/audit", redirect: "/system/audit" },
    { path: "/users", redirect: "/system/users" },

    { path: "/items", component: Items, meta: { role: "admin" } },
  ],
});

router.beforeEach(async (to) => {
  startRoutePagePending();
  if ((to.meta as any)?.public) return true;
  const auth = useAuth();

  if (!auth.user) {
    const cached = hydrateAuthFromCache();
    if (cached) {
      if (shouldRefreshAuthInBackground()) {
        scheduleOnIdle(() => {
          void fetchMe({ force: true, handleUnauthorized: false }).catch(() => {
            auth.user = null;
            const path = window.location.pathname;
            if (path !== '/login') {
              const redirect = encodeURIComponent(to.fullPath);
              window.location.replace(`/login?redirect=${redirect}`);
            }
          });
        }, 1500);
      }
    } else {
      try {
        await fetchMe({ force: true });
      } catch (e: any) {
        auth.user = null;
        return { path: "/login", query: { redirect: to.fullPath } };
      }
    }
  }

  const fallbackPath = firstAccessibleRoute(auth.user);
  const partsAllowed = canAccessModuleArea(auth.user, 'parts');
  const pcModuleAllowed = canAccessModuleArea(auth.user, 'pc');
  const pcAllowed = canAccessPcSection(auth.user, 'pc');
  const monitorAllowed = canAccessPcSection(auth.user, 'monitor');

  if (isPartsModuleRoute(to.path) && !partsAllowed) {
    ElMessage.warning('当前账号未授权访问配件仓');
    return { path: fallbackPath };
  }
  if (isPcModuleRoute(to.path)) {
    if (!pcModuleAllowed) {
      ElMessage.warning('当前账号未授权访问电脑/显示器仓');
      return { path: fallbackPath };
    }
    if (isPcOnlyRoute(to.path) && !pcAllowed) {
      ElMessage.warning('当前账号未授权访问电脑仓');
      return { path: monitorAllowed ? '/pc/monitors' : fallbackPath };
    }
    if (isMonitorOnlyRoute(to.path) && !monitorAllowed) {
      ElMessage.warning('当前账号未授权访问显示器仓');
      return { path: pcAllowed ? '/pc/assets' : fallbackPath };
    }
  }

  const wh = useWarehouse();
  const defaultArea = firstAccessibleArea(auth.user);
  if (!wh.active || (wh.active === 'parts' && !partsAllowed) || (wh.active === 'pc' && !pcModuleAllowed)) {
    setWarehouse(defaultArea);
  }
  if (isPcModuleRoute(to.path) && wh.active !== 'pc') setWarehouse('pc');
  if (isPartsModuleRoute(to.path) && wh.active !== 'parts') setWarehouse('parts');

  const need = (to.meta as any)?.role as any;
  if (need && !can(need)) {
    ElMessage.warning("权限不足");
    return { path: fallbackPath };
  }

  if (to.path === '/pc' || to.path === '/pc/') {
    return { path: preferredPcRoute(auth.user) };
  }
  return true;
});

export default router;


function prefetchChunk(key: string, loader?: () => Promise<unknown>) {
  if (!loader || hasPrefetchedRouteChunk(key) || !shouldAllowRoutePrefetch()) return;
  markPrefetchedRouteChunk(key);
  scheduleOnIdle(() => {
    if (!shouldAllowRoutePrefetch()) {
      clearPrefetchedRouteChunk(key);
      return;
    }
    loader().catch(() => {
      clearPrefetchedRouteChunk(key);
    });
  }, 1800);
}

const defaultPcFilters = { status: '', keyword: '', inventoryStatus: '', archiveReason: '', showArchived: false, archiveMode: 'active' as const };
const defaultMonitorFilters = { status: '', locationId: '', keyword: '', inventoryStatus: '', archiveReason: '', showArchived: false, archiveMode: 'active' as const };

function prewarmPcLedgerData(_authUser: ReturnType<typeof useAuth>["user"], _routePath: string) {
}

router.afterEach((to) => {
  requestAnimationFrame(() => finishRoutePagePending());
  if ((to.meta as any)?.public || !shouldAllowRoutePrefetch()) return;
  const auth = useAuth();
  const tasks: Array<[string, () => Promise<unknown>, boolean]> = [];
  const add = (key: string, loader: () => Promise<unknown>, enabled = true) => {
    tasks.push([key, loader, enabled]);
  };
  const canAdminAccess = auth.user?.role === 'admin';
  const canOperate = auth.user?.role === 'admin' || auth.user?.role === 'operator';
  const canViewParts = canAccessModuleArea(auth.user, 'parts');
  const canViewPc = canAccessModuleArea(auth.user, 'pc');
  const canViewPcLedger = canAccessPcSection(auth.user, 'pc');
  const canViewMonitorLedger = canAccessPcSection(auth.user, 'monitor');

  prewarmPcLedgerData(auth.user, to.path);

  if (to.path.startsWith('/system')) {
    if (to.path === '/system/home') {
      add('/system/dashboard', Dashboard, canAdminAccess);
    } else if (to.path === '/system/dashboard') {
      add('/system/audit', AuditLog, canAdminAccess);
    } else if (to.path === '/system/tools') {
    } else {
    }
  } else if (to.path.startsWith('/pc')) {
    if (to.path === '/pc/assets') {
      add('/pc/tx', preloadPcTx, canViewPc && canViewPcLedger);
      add('/pc/age-warnings', preloadPcAgeWarnings, canViewPc && canViewPcLedger);
    } else if (to.path === '/pc/monitors') {
      add('/pc/monitor-tx', preloadMonitorTx, canViewPc && canViewMonitorLedger);
      add('/pc/monitor-inventory-logs', preloadMonitorInventoryLogs, canViewPc && canViewMonitorLedger);
    } else if (to.path === '/pc/tx') {
      add('/pc/assets', preloadPcAssets, canViewPc && canViewPcLedger);
    } else if (to.path === '/pc/monitor-tx') {
      add('/pc/monitors', preloadMonitorAssets, canViewPc && canViewMonitorLedger);
    } else if (to.path === '/pc/inventory-logs') {
      add('/pc/assets', preloadPcAssets, canViewPc && canViewPcLedger);
      add('/pc/tx', preloadPcTx, canViewPc && canViewPcLedger);
    } else if (to.path === '/pc/monitor-inventory-logs') {
      add('/pc/monitors', preloadMonitorAssets, canViewPc && canViewMonitorLedger);
      add('/pc/monitor-tx', preloadMonitorTx, canViewPc && canViewMonitorLedger);
    } else {
      add('/pc/assets', preloadPcAssets, canViewPc && canViewPcLedger);
      add('/pc/monitors', preloadMonitorAssets, canViewPc && canViewMonitorLedger);
    }
  } else {
    if (to.path === '/stock') {
      add('/tx', TxList, canViewParts);
      add('/warnings', Warnings, canViewParts);
    } else if (to.path === '/tx') {
      add('/stock', StockQuery, canViewParts);
      add('/batch', BatchTx, canOperate && canViewParts);
    } else {
      add('/stock', StockQuery, canViewParts);
      add('/tx', TxList, canViewParts);
    }
  }

  const selected = tasks
    .filter(([key, , enabled]) => enabled && key !== to.path)
    .slice(0, 1);
  selected.forEach(([key, loader]) => prefetchChunk(key, loader));
});


const dynamicImportRecoveryKey = "__inventory_dynamic_import_reload__";

router.onError((error, to) => {
  finishRoutePagePending();
  const message = error instanceof Error ? error.message : String(error ?? '');
  const isDynamicImportError = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
  if (!isDynamicImportError || typeof window === 'undefined') return;
  try {
    const lastFailedPath = sessionStorage.getItem(dynamicImportRecoveryKey);
    if (lastFailedPath === to.fullPath) {
      sessionStorage.removeItem(dynamicImportRecoveryKey);
      return;
    }
    sessionStorage.setItem(dynamicImportRecoveryKey, to.fullPath);
  } catch {}
  const target = to?.fullPath || window.location.pathname || '/';
  window.location.replace(target);
});

router.afterEach((to) => {
  try {
    if (typeof window !== 'undefined') {
      const lastFailedPath = sessionStorage.getItem(dynamicImportRecoveryKey);
      if (lastFailedPath === to.fullPath) sessionStorage.removeItem(dynamicImportRecoveryKey);
    }
  } catch {}
});
