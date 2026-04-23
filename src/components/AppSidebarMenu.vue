<template>
  <div class="app-sidebar-menu" :class="{ 'app-sidebar-menu--collapsed': collapsed, 'app-sidebar-menu--mobile': isMobile }">
    <div class="app-sidebar-menu__brand" :title="brandTitle">
      <span v-if="collapsed" class="app-sidebar-menu__brand-badge" aria-hidden="true">
        <el-icon><Box /></el-icon>
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

const brandTitle = '出入库管理';

const systemItems = computed<MenuItem[]>(() => [
  { index: '/system/home', label: '系统首页', icon: markRaw(Setting), visible: props.isAdmin },
  { index: '/system/dashboard', label: '报表与看板', icon: markRaw(DataAnalysis), visible: props.isAdmin },
  { index: '/system/reports', label: '数据报表中心', icon: markRaw(Histogram), visible: props.isAdmin },
  { index: '/system/tasks', label: '批量任务中心', icon: markRaw(Files), visible: props.isAdmin || props.canManageSystemJobs },
  { index: '/system/backup', label: '备份/恢复', icon: markRaw(RefreshRight), visible: props.isAdmin },
  { index: '/system/audit', label: '审计日志', icon: markRaw(Document), visible: props.isAdmin || props.canAuditExport },
  { index: '/system/users', label: '用户管理', icon: markRaw(User), visible: props.isAdmin },
  { index: '/system/settings', label: '系统配置', icon: markRaw(Tools), visible: props.isAdmin || props.canManageSystemSettings },
  { index: '/system/tools', label: '运维工具', icon: markRaw(Operation), visible: props.isAdmin || props.canManageSystemTools },
  { index: '/system/release-check', label: '发布前检查', icon: markRaw(FolderChecked), visible: props.isAdmin },
  { index: '/system/performance', label: '性能面板', icon: markRaw(TrendCharts), visible: props.isAdmin || props.canManageSystemTools },
  { index: '/system/docs', label: '系统交付文档', icon: markRaw(Reading), visible: props.isAdmin },
]);

const partsItems = computed<MenuItem[]>(() => [
  { index: '/stock', label: '库存查询', icon: markRaw(Box), visible: true },
  { index: '/tx', label: '出入库明细', icon: markRaw(Document), visible: true },
  { index: '/warnings', label: '预警中心', icon: markRaw(Warning), visible: true },
  { index: '/in', label: '入库', icon: markRaw(Plus), visible: props.canOperator },
  { index: '/out', label: '出库', icon: markRaw(Minus), visible: props.canOperator },
  { index: '/batch', label: '批量出入库', icon: markRaw(Operation), visible: props.canOperator },
  { index: '/items', label: '配件管理', icon: markRaw(Management), visible: props.isAdmin },
  { index: '/import/items', label: 'Excel 导入配件', icon: markRaw(Upload), visible: props.isAdmin },
  { index: '/stocktake', label: '库存盘点', icon: markRaw(Checked), visible: props.isAdmin },
  { index: props.systemEntryPath, label: '系统', icon: markRaw(Setting), visible: props.canAccessSystemArea },
]);

const pcItems = computed<MenuItem[]>(() => [
  { index: '/pc/assets', label: '电脑台账', icon: markRaw(Cpu), visible: props.canAccessPcLedger },
  { index: '/pc/age-warnings', label: '报废预警', icon: markRaw(Warning), visible: props.canAccessPcLedger },
  { index: '/pc/tx', label: '电脑出入库明细', icon: markRaw(Document), visible: props.canAccessPcLedger },
  { index: '/pc/inventory-logs', label: '盘点记录', icon: markRaw(Checked), visible: props.canAccessPcLedger },
  { index: '/pc/monitors', label: '显示器台账', icon: markRaw(Monitor), visible: props.canAccessMonitorLedger },
  { index: '/pc/monitor-tx', label: '显示器出入库明细', icon: markRaw(Document), visible: props.canAccessMonitorLedger },
  { index: '/pc/monitor-inventory-logs', label: '显示器盘点记录', icon: markRaw(Checked), visible: props.canAccessMonitorLedger },
  { index: '/pc/in', label: '电脑入库', icon: markRaw(Plus), visible: props.canOperator && props.canAccessPcLedger },
  { index: '/pc/out', label: '电脑出库', icon: markRaw(Minus), visible: props.canOperator && props.canAccessPcLedger },
  { index: '/pc/recycle', label: '电脑回收/归还', icon: markRaw(RefreshRight), visible: props.canOperator && props.canAccessPcLedger },
  { index: props.systemEntryPath, label: '系统', icon: markRaw(Setting), visible: props.canAccessSystemArea },
]);

const visibleItems = computed(() => {
  if (props.isSystem) return systemItems.value.filter((item) => item.visible);
  if (props.warehouseActive === 'parts' && props.canAccessPartsArea) return partsItems.value.filter((item) => item.visible);
  if (props.canAccessPcArea) return pcItems.value.filter((item) => item.visible);
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
