<template>
  <router-view v-if="simpleLayout" />

  <div v-else class="app-root">
    <div class="app-bg" />

    <el-container class="app-layout">
      <el-aside width="236px" class="app-aside">
        <div class="app-brand">
          <div class="app-brand__mark">IM</div>
          <div class="app-brand__meta">
            <div class="app-brand__title">出入库管理</div>
            <div class="app-brand__subtitle">{{ areaLabel }}</div>
          </div>
        </div>

        <div class="app-nav-caption">业务导航</div>
        <el-menu router :default-active="activeMenu" class="app-menu">
          <template v-for="group in currentMenuGroups" :key="group.label">
            <div class="app-menu__group-label">{{ group.label }}</div>
            <el-menu-item
              v-for="item in group.items"
              :key="item.index"
              :index="item.index"
            >
              {{ item.label }}
            </el-menu-item>
          </template>
        </el-menu>

        <div class="app-aside-footer">
          <div class="app-aside-footer__label">当前工作区</div>
          <div class="app-aside-footer__value">{{ areaLabel }}</div>
          <div class="app-aside-footer__hint">按业务区域组织菜单，减少页面跳转成本。</div>
        </div>
      </el-aside>

      <el-container class="app-content">
        <el-header class="app-header">
          <div class="app-header__left">
            <div class="app-header__titles">
              <div class="app-header__eyebrow">{{ areaLabel }}</div>
              <div class="app-header__title">{{ title }}</div>
              <div class="app-header__desc">{{ headerDescription }}</div>
            </div>

            <el-button-group class="app-area-switch">
              <el-button
                v-if="canAccessPartsArea"
                size="small"
                :type="currentArea === 'parts' ? 'primary' : 'default'"
                @click="switchTo('parts')"
              >
                配件仓
              </el-button>
              <el-button
                v-if="canAccessPcArea"
                size="small"
                :type="currentArea === 'pc' ? 'primary' : 'default'"
                @click="switchTo('pc')"
              >
                {{ pcAreaLabel }}
              </el-button>
              <el-button
                v-if="can('admin')"
                size="small"
                :type="currentArea === 'system' ? 'primary' : 'default'"
                @click="switchToSystem"
              >
                系统
              </el-button>
            </el-button-group>
          </div>

          <div class="app-header__right">
            <div v-if="auth.user" class="app-user-chip">
              <div class="app-user-chip__name">{{ auth.user.username }}</div>
              <div class="app-user-chip__role">{{ roleText(auth.user.role) }}</div>
            </div>
            <el-button size="small" @click="goChangePwd">
              改密码
            </el-button>
            <el-button size="small" type="danger" plain @click="doLogout">
              退出
            </el-button>
          </div>
        </el-header>

        <el-main class="app-main">
          <div class="page-wrap">
            <el-alert
              v-if="schemaStatus.loaded && !schemaStatus.ok"
              class="app-page-alert"
              type="error"
              :closable="false"
              show-icon
              :title="schemaStatus.message || '数据库结构未升级到当前版本，请先执行迁移'"
            />

            <el-alert
              v-if="opsAlert.visible"
              class="app-page-alert"
              :type="opsAlert.type"
              :closable="false"
              show-icon
            >
              <template #title>
                <div class="app-alert-titlebar">
                  <div class="app-alert-titlebar__text">{{ opsAlert.title }}</div>
                  <div class="app-alert-titlebar__actions">
                    <el-button size="small" @click="router.push('/system/tools')">
                      打开运维工具
                    </el-button>
                    <el-button size="small" plain @click="router.push('/system/release-check')">
                      打开发布前检查
                    </el-button>
                  </div>
                </div>
              </template>
              <div class="app-alert-detail">{{ opsAlert.detail }}</div>
            </el-alert>

            <router-view v-slot="{ Component }">
              <keep-alive :include="cachedViewNames" :max="8">
                <component :is="Component" />
              </keep-alive>
            </router-view>
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
          <el-input v-model="oldP" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="newP" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showChange = false">
          取消
        </el-button>
        <el-button type="primary" :loading="changing" @click="changePwd">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "./utils/el-services";
import { apiPost } from "./api/client";
import { getSystemHealth, getSystemSchemaStatus } from "./api/systemHealth";
import { can, logout, useAuth } from "./store/auth";
import { setWarehouse, useWarehouse, type WarehouseKey, clearWarehouse } from "./store/warehouse";
import { canAccessModuleArea, canAccessPcSection, preferredPcRoute } from "./utils/moduleAccess";
import { installGlobalTableScrollEnhancer } from "./utils/globalTableScroll";

type MenuItem = {
  index: string;
  label: string;
};

type MenuGroup = {
  label: string;
  items: MenuItem[];
};

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const warehouse = useWarehouse();

const isSystem = computed(() => route.path.startsWith("/system"));

const canAccessPartsArea = computed(() => canAccessModuleArea(auth.user, "parts"));
const canAccessPcArea = computed(() => canAccessModuleArea(auth.user, "pc"));
const canAccessPcLedger = computed(() => canAccessPcSection(auth.user, "pc"));
const canAccessMonitorLedger = computed(() => canAccessPcSection(auth.user, "monitor"));

const currentArea = computed(() => {
  if (isSystem.value) return "system";
  return warehouse.active === "pc" ? "pc" : "parts";
});

const simpleLayout = computed(() => (route.meta as any)?.public || route.path === "/login" || route.path === "/warehouses");
const activeMenu = computed(() => route.path);

const pcAreaLabel = computed(() => {
  if (canAccessPcLedger.value && canAccessMonitorLedger.value) return "电脑/显示器仓";
  if (canAccessPcLedger.value) return "电脑仓";
  return "显示器仓";
});

const areaLabel = computed(() => {
  if (isSystem.value) return "系统管理";
  return warehouse.active === "pc" ? pcAreaLabel.value : "配件仓";
});

const title = computed(() => {
  if (isSystem.value) {
    const t = (route.meta as any)?.title as string | undefined;
    return t || "系统";
  }

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

const headerDescription = computed(() => {
  if (isSystem.value) return "统一查看系统状态、配置、运维工具与交付检查。";
  if (warehouse.active === "pc") return "围绕台账、流转、盘点与报废预警组织日常工作。";
  return "围绕库存、出入库、预警与盘点任务组织日常操作。";
});

const systemMenuGroups = computed<MenuGroup[]>(() => [
  {
    label: "系统总览",
    items: [
      { index: "/system/home", label: "系统首页" },
      { index: "/system/dashboard", label: "报表与看板" },
    ],
  },
  {
    label: "系统管理",
    items: [
      { index: "/system/backup", label: "备份/恢复" },
      { index: "/system/audit", label: "审计日志" },
      { index: "/system/users", label: "用户管理" },
      { index: "/system/settings", label: "系统配置" },
      { index: "/system/docs", label: "系统交付文档" },
    ],
  },
  {
    label: "运维支持",
    items: [
      { index: "/system/tools", label: "运维工具" },
      { index: "/system/release-check", label: "发布前检查" },
      { index: "/system/performance", label: "性能面板" },
    ],
  },
]);

const partsMenuGroups = computed<MenuGroup[]>(() => {
  const groups: MenuGroup[] = [
    {
      label: "库存与记录",
      items: [
        { index: "/stock", label: "库存查询" },
        { index: "/tx", label: "出入库明细" },
        { index: "/warnings", label: "预警中心" },
      ],
    },
    {
      label: "业务操作",
      items: [
        ...(can("operator") ? [{ index: "/in", label: "入库" }] : []),
        ...(can("operator") ? [{ index: "/out", label: "出库" }] : []),
        ...(can("operator") ? [{ index: "/batch", label: "批量出入库" }] : []),
      ],
    },
    {
      label: "配置与系统",
      items: [
        ...(can("admin") ? [{ index: "/items", label: "配件管理" }] : []),
        ...(can("admin") ? [{ index: "/import/items", label: "Excel 导入配件" }] : []),
        ...(can("admin") ? [{ index: "/stocktake", label: "库存盘点" }] : []),
        ...(can("admin") ? [{ index: "/system/home", label: "系统" }] : []),
      ],
    },
  ];
  return groups.filter((group) => group.items.length > 0);
});

const pcMenuGroups = computed<MenuGroup[]>(() => {
  const groups: MenuGroup[] = [
    {
      label: "台账与记录",
      items: [
        ...(canAccessPcLedger.value ? [{ index: "/pc/assets", label: "电脑台账" }] : []),
        ...(canAccessPcLedger.value ? [{ index: "/pc/age-warnings", label: "报废预警" }] : []),
        ...(canAccessPcLedger.value ? [{ index: "/pc/tx", label: "电脑出入库明细" }] : []),
        ...(canAccessPcLedger.value ? [{ index: "/pc/inventory-logs", label: "盘点记录" }] : []),
        ...(canAccessMonitorLedger.value ? [{ index: "/pc/monitors", label: "显示器台账" }] : []),
        ...(canAccessMonitorLedger.value ? [{ index: "/pc/monitor-tx", label: "显示器出入库明细" }] : []),
        ...(canAccessMonitorLedger.value ? [{ index: "/pc/monitor-inventory-logs", label: "显示器盘点记录" }] : []),
      ],
    },
    {
      label: "业务操作",
      items: [
        ...(can("operator") && canAccessPcLedger.value ? [{ index: "/pc/in", label: "电脑入库" }] : []),
        ...(can("operator") && canAccessPcLedger.value ? [{ index: "/pc/out", label: "电脑出库" }] : []),
        ...(can("operator") && canAccessPcLedger.value ? [{ index: "/pc/recycle", label: "电脑回收/归还" }] : []),
      ],
    },
    {
      label: "配置与系统",
      items: [
        ...(can("admin") ? [{ index: "/system/home", label: "系统" }] : []),
      ],
    },
  ];
  return groups.filter((group) => group.items.length > 0);
});

const currentMenuGroups = computed<MenuGroup[]>(() => {
  if (isSystem.value) return systemMenuGroups.value;
  if (warehouse.active === "pc" && canAccessPcArea.value) return pcMenuGroups.value;
  return partsMenuGroups.value;
});

function roleText(r: string) {
  return r === "admin" ? "管理员" : r === "operator" ? "操作员" : "只读";
}

function switchTo(k: WarehouseKey) {
  if (!k) return;
  if (k === "parts" && !canAccessPartsArea.value) return;
  if (k === "pc" && !canAccessPcArea.value) return;
  if (!isSystem.value && warehouse.active === k) return;
  setWarehouse(k);
  router.push(k === "pc" ? preferredPcRoute(auth.user) : "/stock");
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
const cachedViewNames = ["StockQuery", "TxList", "Warnings", "PcAssets", "MonitorAssets"];
const needsSystemMeta = computed(() => ["/system/home", "/system/tools", "/system/release-check", "/system/dashboard"].includes(route.path));
const schemaStatus = reactive<{ loaded: boolean; ok: boolean; message: string; required_version?: string; current_version?: string }>({
  loaded: false,
  ok: true,
  message: "",
});
const opsAlert = reactive<{ visible: boolean; type: "warning" | "error"; title: string; detail: string }>({
  visible: false,
  type: "warning",
  title: "",
  detail: "",
});

let removeGlobalTableScrollEnhancer: (() => void) | null = null;
onMounted(() => {
  removeGlobalTableScrollEnhancer = installGlobalTableScrollEnhancer();
});
onBeforeUnmount(() => {
  removeGlobalTableScrollEnhancer?.();
  removeGlobalTableScrollEnhancer = null;
});

async function loadSchemaStatus() {
  if (!auth.user || simpleLayout.value || !needsSystemMeta.value) {
    schemaStatus.loaded = false;
    schemaStatus.ok = true;
    schemaStatus.message = "";
    return;
  }
  try {
    const r: any = await getSystemSchemaStatus();
    schemaStatus.loaded = true;
    schemaStatus.ok = !!r.data?.ok;
    schemaStatus.message = String(r.data?.message || "");
    schemaStatus.required_version = r.data?.required_version;
    schemaStatus.current_version = r.data?.current_version;
  } catch {
    schemaStatus.loaded = true;
    schemaStatus.ok = true;
    schemaStatus.message = "";
  }
}

async function loadOpsAlert() {
  if (!auth.user || simpleLayout.value || auth.user.role !== "admin" || !needsSystemMeta.value) {
    opsAlert.visible = false;
    return;
  }
  try {
    const r: any = await getSystemHealth();
    const alerts = r.data?.alerts || {};
    const active = Number(alerts.active_count || 0);
    if (!active) {
      opsAlert.visible = false;
      return;
    }
    const parts: string[] = [];
    if (alerts.schema_issue) parts.push("Schema 未就绪");
    if (alerts.scan_issue) parts.push(`巡检发现 ${Number(r.data?.scan?.total_problem_count || 0)} 类问题`);
    if (Number(alerts.failed_jobs || 0) > 0) parts.push(`失败异步任务 ${Number(alerts.failed_jobs || 0)} 个`);
    if (Number(alerts.error_5xx_last_24h || 0) > 0) parts.push(`近 24h 发生 ${Number(alerts.error_5xx_last_24h || 0)} 次 5xx`);
    opsAlert.visible = true;
    opsAlert.type = alerts.schema_issue ? "error" : "warning";
    opsAlert.title = `系统当前有 ${active} 项主动告警`;
    opsAlert.detail = parts.join("；");
  } catch {
    opsAlert.visible = false;
  }
}

watch(() => [route.path, auth.user?.id, needsSystemMeta.value], () => {
  loadSchemaStatus();
  loadOpsAlert();
}, { immediate: true });

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
