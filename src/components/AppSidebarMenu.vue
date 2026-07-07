<template>
  <div class="app-sidebar-menu" :class="{ 'app-sidebar-menu--collapsed': collapsed, 'app-sidebar-menu--mobile': isMobile }">
    <div class="app-sidebar-menu__brand" :title="brandTitle">
      <span v-if="collapsed" class="app-sidebar-menu__brand-badge" aria-hidden="true">
        <component :is="brandIcon" class="app-sidebar-menu__brand-icon" />
      </span>
      <template v-else>{{ brandTitle }}</template>
    </div>

    <el-menu
      router
      :default-active="activeMenu"
      class="app-sidebar-menu__menu"
      :collapse="collapsed"
      :collapse-transition="false"
      @select="handleMenuSelect"
    >
      <el-menu-item
        v-for="item in visibleItems"
        :key="item.index"
        :index="item.index"
        :title="collapsed ? item.label : undefined"
        class="app-sidebar-menu__item"
        @click="handleMenuItemClick(item.index)"
      >
        <div class="app-sidebar-menu__item-inner">
          <span class="app-sidebar-menu__item-icon" aria-hidden="true">
            <component :is="item.icon" class="app-sidebar-menu__icon-svg" />
          </span>
          <span v-if="!collapsed" class="app-sidebar-menu__item-label">{{ item.label }}</span>
        </div>
      </el-menu-item>
    </el-menu>

    <div class="app-sidebar-menu__meta" :title="metaTitle">
      {{ collapsed ? currentLabelShort : `当前：${currentLabel}` }}
    </div>

    <button
      v-if="!isMobile"
      class="app-sidebar-menu__collapse-btn"
      type="button"
      :aria-label="collapsed ? '展开左侧菜单' : '收起左侧菜单'"
      :title="collapsed ? '展开左侧菜单' : '收起左侧菜单'"
      @click="$emit('toggle-collapse')"
    >
      <span v-if="!collapsed" class="app-sidebar-menu__collapse-text">收起侧边栏</span>
      <span class="app-sidebar-menu__collapse-arrow" aria-hidden="true">{{ collapsed ? '›' : '‹' }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw } from 'vue';
import {
  Box,
  Document,
  Warning,
  Plus,
  Minus,
  Operation,
  Management,
  Upload,
  Checked,
  Setting,
  DataAnalysis,
  Histogram,
  Files,
  RefreshRight,
  Monitor,
  Cpu,
  Tools,
  User,
  Reading,
  FolderChecked,
  TrendCharts,
} from '@element-plus/icons-vue';
import {
  PARTS_ROUTE_DEFS,
  PC_ROUTE_DEFS,
  SYSTEM_ROUTE_DEFS,
  type ModuleRouteDefinition,
  type RouteIconName,
} from '../router/moduleRouteManifest';

const props = defineProps<{
  isSystem: boolean;
  activeMenu: string;
  warehouseActive: 'parts' | 'pc';
  canAccessPartsArea: boolean;
  canAccessPcArea: boolean;
  canAccessPcLedger: boolean;
  canAccessMonitorLedger: boolean;
  canAccessSystemArea: boolean;
  systemEntryPath: string;
  canManageSystemJobs: boolean;
  canManageSystemTools: boolean;
  canManageSystemSettings: boolean;
  canAuditExport: boolean;
  canOperator: boolean;
  isAdmin: boolean;
  collapsed?: boolean;
  isMobile?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-collapse'): void;
  (e: 'menu-select', index: string): void;
}>();

function handleMenuSelect(index: string) {
  emit('menu-select', String(index || ''));
}

function handleMenuItemClick(index: string) {
  emit('menu-select', String(index || ''));
}

type MenuItem = {
  index: string;
  label: string;
  icon: object;
  visible: boolean;
};

const brandIcon = computed(() => {
  if (props.isSystem) return markRaw(Setting);
  if (props.warehouseActive === 'pc') return markRaw(Cpu);
  return markRaw(Box);
});

const brandTitle = '出入库管理';

const iconMap: Record<RouteIconName, object> = {
  box: markRaw(Box),
  document: markRaw(Document),
  warning: markRaw(Warning),
  plus: markRaw(Plus),
  minus: markRaw(Minus),
  operation: markRaw(Operation),
  management: markRaw(Management),
  upload: markRaw(Upload),
  checked: markRaw(Checked),
  setting: markRaw(Setting),
  'data-analysis': markRaw(DataAnalysis),
  histogram: markRaw(Histogram),
  files: markRaw(Files),
  refresh: markRaw(RefreshRight),
  monitor: markRaw(Monitor),
  cpu: markRaw(Cpu),
  tools: markRaw(Tools),
  user: markRaw(User),
  reading: markRaw(Reading),
  'folder-checked': markRaw(FolderChecked),
  'trend-charts': markRaw(TrendCharts),
};

function canShowRoute(item: ModuleRouteDefinition) {
  if (item.area === 'system') {
    if (props.isAdmin) return true;
    if (item.capability === 'system.jobs.manage') return props.canManageSystemJobs;
    if (item.capability === 'system.tools.manage') return props.canManageSystemTools;
    if (item.capability === 'system.settings.manage') return props.canManageSystemSettings;
    if (item.permission === 'audit_export') return props.canAuditExport;
    return false;
  }
  if (item.area === 'parts') {
    if (!props.canAccessPartsArea) return false;
    if (props.isAdmin) return true;
    return item.minRole === 'operator' ? props.canOperator : item.minRole !== 'admin';
  }
  if (!props.canAccessPcArea) return false;
  if (item.pcSection === 'pc' && !props.canAccessPcLedger) return false;
  if (item.pcSection === 'monitor' && !props.canAccessMonitorLedger) return false;
  if (props.isAdmin) return true;
  return item.minRole === 'operator' ? props.canOperator : item.minRole !== 'admin';
}

function buildMenuItems(items: ModuleRouteDefinition[]): MenuItem[] {
  return items
    .filter((item) => item.menu && canShowRoute(item))
    .map((item) => ({
      index: item.path,
      label: item.label,
      icon: iconMap[item.icon],
      visible: true,
    }));
}

function systemEntryItem(): MenuItem {
  return { index: props.systemEntryPath, label: '系统', icon: markRaw(Setting), visible: true };
}

const visibleItems = computed(() => {
  if (props.isSystem) return buildMenuItems(SYSTEM_ROUTE_DEFS);
  if (props.warehouseActive === 'parts' && props.canAccessPartsArea) {
    const items = buildMenuItems(PARTS_ROUTE_DEFS);
    if (props.canAccessSystemArea) items.push(systemEntryItem());
    return items;
  }
  if (props.canAccessPcArea) {
    const items = buildMenuItems(PC_ROUTE_DEFS);
    if (props.canAccessSystemArea) items.push(systemEntryItem());
    return items;
  }
  return [];
});

const currentLabel = computed(() => {
  if (props.isSystem) return '系统';
  if (props.warehouseActive === 'pc') {
    if (props.canAccessPcLedger && props.canAccessMonitorLedger) return '电脑/显示器仓';
    return props.canAccessPcLedger ? '电脑仓' : '显示器仓';
  }
  return '配件仓';
});

const currentLabelShort = computed(() => {
  if (props.isSystem) return '系统';
  if (props.warehouseActive === 'pc') return '电脑仓';
  return '配件仓';
});

const metaTitle = computed(() => `当前：${currentLabel.value}`);
</script>
