import { createRouter, createWebHistory } from "vue-router";
import { ref } from "vue";
const StockQuery = () => import("../views/StockQuery.vue");
const StockIn = () => import("../views/StockIn.vue");
const StockOut = () => import("../views/StockOut.vue");
const TxList = () => import("../views/TxList.vue");
const Warnings = () => import("../views/Warnings.vue");
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
const PcTx = () => import("../views/PcTx.vue");
const PcRecycle = () => import("../views/PcRecycle.vue");
const PcAssets = () => import("../views/PcAssets.vue");
const PcWarehouse = () => import("../views/PcWarehouse.vue");
const PcAgeWarnings = () => import("../views/PcAgeWarnings.vue");
const PcInventoryLogs = () => import("../views/PcInventoryLogs.vue");
const MonitorInventoryLogs = () => import("../views/MonitorInventoryLogs.vue");
const MonitorAssets = () => import("../views/MonitorAssets.vue");
const MonitorTx = () => import("../views/MonitorTx.vue");
const SystemHome = () => import("../views/SystemHome.vue");
const SystemSettings = () => import("../views/SystemSettings.vue");
const SystemTaskCenter = () => import("../views/SystemTaskCenter.vue");
const SystemReportsCenter = () => import("../views/SystemReportsCenter.vue");
const SystemOpsTools = () => import("../views/SystemOpsTools.vue");
const SystemPerformance = () => import("../views/SystemPerformance.vue");
const SystemReleaseCheck = () => import("../views/SystemReleaseCheck.vue");
const SystemDocs = () => import("../views/SystemDocs.vue");
const SystemLayout = () => import("../views/SystemLayout.vue");
const PublicPcAsset = () => import("../views/PublicPcAsset.vue");
const PublicMonitorAsset = () => import("../views/PublicMonitorAsset.vue");
import { fetchMe, hydrateAuthFromCache, shouldRefreshAuthInBackground, useAuth, can, canCapability, canPerm } from "../store/auth";
import { useWarehouse, setWarehouse } from "../store/warehouse";
import { ElMessage } from "../utils/el-services";
import { scheduleOnIdle } from "../utils/idle";
import { clearPrefetchedRouteChunk, hasPrefetchedRouteChunk, markPrefetchedRouteChunk, shouldAllowRoutePrefetch } from "../utils/routePrefetch";
import { canAccessModuleArea, canAccessPcSection, canAccessSystemArea, firstAccessibleArea, firstAccessibleRoute, isMonitorOnlyRoute, isPartsModuleRoute, isPcModuleRoute, isPcOnlyRoute, preferredPcRoute } from "../utils/moduleAccess";
import { countMonitorAssets, countPcAssets, listMonitorAssets, listPcAssets } from "../api/assetLedgers";
import { primePagedListCache } from "../composables/usePagedAssetList";

export const routePagePending = ref(false);
export const routePageSkeletonVisible = ref(false);
let routePageSkeletonTimer: ReturnType<typeof setTimeout> | null = null;
let firstRouteResolved = false;

const preloadStockQuery = StockQuery;
const preloadTxList = TxList;
const preloadWarnings = Warnings;

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
  }, 180);
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

const preloadPcAssets = PcAssets;
const preloadMonitorAssets = MonitorAssets;
const preloadPcAgeWarnings = PcAgeWarnings;
const preloadPcTx = PcTx;
const preloadMonitorTx = MonitorTx;
const preloadPcInventoryLogs = PcInventoryLogs;
const preloadMonitorInventoryLogs = MonitorInventoryLogs;

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
      meta: { role: "viewer", title: "系统" },
      children: [
        { path: "home", component: SystemHome, meta: { role: "admin", title: "系统" } },
        { path: "dashboard", component: Dashboard, meta: { role: "admin", title: "报表与看板" } },
        { path: "reports", component: SystemReportsCenter, meta: { role: "admin", title: "数据报表中心" } },
        { path: "tasks", component: SystemTaskCenter, meta: { role: "viewer", title: "批量任务中心", capability: 'system.jobs.manage' } },
        { path: "import", redirect: "/import/items", meta: { role: "admin", title: "Excel 导入配件" } },
        { path: "backup", component: BackupRestore, meta: { role: "admin", title: "备份/恢复" } },
        { path: "audit", component: AuditLog, meta: { role: "viewer", title: "审计日志", permission: 'audit_export' } },
        { path: "users", component: Users, meta: { role: "admin", title: "用户管理" } },
        { path: "settings", component: SystemSettings, meta: { role: "viewer", title: "系统配置", capability: 'system.settings.manage' } },
        { path: "tools", component: SystemOpsTools, meta: { role: "viewer", title: "运维工具", capability: 'system.tools.manage' } },
        { path: "release-check", component: SystemReleaseCheck, meta: { role: "admin", title: "发布前检查" } },
        { path: "performance", component: SystemPerformance, meta: { role: "viewer", title: "性能面板", capability: 'system.tools.manage' } },
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
  const systemAllowed = canAccessSystemArea(auth.user);
  const partsAllowed = canAccessModuleArea(auth.user, 'parts');
  const pcModuleAllowed = canAccessModuleArea(auth.user, 'pc');
  const pcAllowed = canAccessPcSection(auth.user, 'pc');
  const monitorAllowed = canAccessPcSection(auth.user, 'monitor');

  if (to.path.startsWith('/system') && !systemAllowed) {
    ElMessage.warning('当前账号未授权访问系统模块');
    return { path: fallbackPath };
  }
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
  const capability = (to.meta as any)?.capability as any;
  if (capability && !canCapability(capability)) {
    ElMessage.warning('当前账号缺少对应能力授权');
    return { path: fallbackPath };
  }
  const permission = (to.meta as any)?.permission as any;
  if (permission && !canPerm(permission)) {
    ElMessage.warning('当前账号缺少对应权限授权');
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

const ledgerPrewarmState = {
  pc: { at: 0, inFlight: null as Promise<void> | null },
  monitor: { at: 0, inFlight: null as Promise<void> | null },
};
const LEDGER_PREWARM_TTL_MS = 45_000;

function clampPageSize(value: unknown) {
  return Math.min(200, Math.max(20, Number(value || 50) || 50));
}

function safeReadStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? ({ ...fallback, ...parsed } as T) : fallback;
  } catch {
    return fallback;
  }
}

function toBool(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === '1' || value === 1 || value === 'true') return true;
  if (value === '0' || value === 0 || value === 'false') return false;
  return fallback;
}

function pcFilterKey(filters: typeof defaultPcFilters) {
  return `status=${filters.status}&inventory=${filters.inventoryStatus || ''}&keyword=${filters.keyword}&archive=${filters.archiveReason || ''}&archived=${filters.showArchived ? 1 : 0}&archiveMode=${filters.archiveMode}`;
}

function monitorFilterKey(filters: typeof defaultMonitorFilters) {
  return `status=${filters.status}&location=${filters.locationId}&inventory=${filters.inventoryStatus || ''}&keyword=${filters.keyword}&archive=${filters.archiveReason || ''}&archived=${filters.showArchived ? 1 : 0}&archiveMode=${filters.archiveMode}`;
}

function readPcFiltersForPrewarm() {
  const persisted = safeReadStorage('inventory:pc-assets:filters', defaultPcFilters as any) as any;
  const archiveMode = ['active', 'archived', 'all'].includes(String(persisted?.archiveMode || '')) ? String(persisted.archiveMode) : 'active';
  const showArchived = toBool(persisted?.showArchived, archiveMode !== 'active');
  return {
    status: String(persisted?.status || ''),
    keyword: String(persisted?.keyword || ''),
    inventoryStatus: String(persisted?.inventoryStatus || ''),
    archiveReason: archiveMode !== 'active' ? String(persisted?.archiveReason || '') : '',
    showArchived,
    archiveMode: archiveMode as typeof defaultPcFilters.archiveMode,
    pageSize: clampPageSize(persisted?.pageSize),
  };
}

function readMonitorFiltersForPrewarm() {
  const persisted = safeReadStorage('inventory:monitor-assets:filters', defaultMonitorFilters as any) as any;
  const archiveMode = ['active', 'archived', 'all'].includes(String(persisted?.archiveMode || '')) ? String(persisted.archiveMode) : 'active';
  const showArchived = toBool(persisted?.showArchived, archiveMode !== 'active');
  return {
    status: String(persisted?.status || ''),
    locationId: String(persisted?.locationId || ''),
    keyword: String(persisted?.keyword || ''),
    inventoryStatus: String(persisted?.inventoryStatus || ''),
    archiveReason: archiveMode !== 'active' ? String(persisted?.archiveReason || '') : '',
    showArchived,
    archiveMode: archiveMode as typeof defaultMonitorFilters.archiveMode,
    pageSize: clampPageSize(persisted?.pageSize),
  };
}

async function prewarmPcListData() {
  const filters = readPcFiltersForPrewarm();
  const key = pcFilterKey(filters);
  const [listResult, total] = await Promise.all([
    listPcAssets(filters, 1, filters.pageSize, true).catch(() => ({ rows: [], total: 0 })),
    countPcAssets(filters).catch(() => 0),
  ]);
  primePagedListCache('pc-assets', key, 1, filters.pageSize, {
    rows: Array.isArray(listResult?.rows) ? listResult.rows : [],
    total: Number(total || listResult?.total || 0),
    timestamp: Date.now(),
  });
}

async function prewarmMonitorListData() {
  const filters = readMonitorFiltersForPrewarm();
  const key = monitorFilterKey(filters);
  const [listResult, total] = await Promise.all([
    listMonitorAssets(filters, 1, filters.pageSize, true).catch(() => ({ rows: [], total: 0 })),
    countMonitorAssets(filters).catch(() => 0),
  ]);
  primePagedListCache('monitor-assets', key, 1, filters.pageSize, {
    rows: Array.isArray(listResult?.rows) ? listResult.rows : [],
    total: Number(total || listResult?.total || 0),
    timestamp: Date.now(),
  });
}

function prewarmWithThrottle(kind: 'pc' | 'monitor', task: () => Promise<void>) {
  const state = ledgerPrewarmState[kind];
  if (state.inFlight) return;
  if (Date.now() - state.at < LEDGER_PREWARM_TTL_MS) return;
  state.inFlight = task().catch(() => undefined).finally(() => {
    state.at = Date.now();
    state.inFlight = null;
  });
}

function prewarmPcLedgerData(_authUser: ReturnType<typeof useAuth>["user"], _routePath: string) {
  if (!shouldAllowRoutePrefetch()) return;
  const path = String(_routePath || '');
  const canPcLedger = canAccessPcSection(_authUser, 'pc');
  const canMonitorLedger = canAccessPcSection(_authUser, 'monitor');

  if ((path === '/pc/assets' || path.startsWith('/pc/assets?')) && canMonitorLedger) {
    prefetchChunk('pc-monitor-assets', preloadMonitorAssets);
    scheduleOnIdle(() => prewarmWithThrottle('monitor', prewarmMonitorListData), 1000);
    return;
  }
  if ((path === '/pc/monitors' || path.startsWith('/pc/monitors?')) && canPcLedger) {
    prefetchChunk('pc-pc-assets', preloadPcAssets);
    scheduleOnIdle(() => prewarmWithThrottle('pc', prewarmPcListData), 1000);
    return;
  }

  if (!path.startsWith('/pc')) return;
  if (canPcLedger) prefetchChunk('pc-pc-assets', preloadPcAssets);
  if (canMonitorLedger) prefetchChunk('pc-monitor-assets', preloadMonitorAssets);
}

router.afterEach((to) => {
  requestAnimationFrame(() => finishRoutePagePending());
  if ((to.meta as any)?.public) return;
  const auth = useAuth();
  prewarmPcLedgerData(auth.user, to.fullPath || to.path || '');
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
