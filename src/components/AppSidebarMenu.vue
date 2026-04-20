<template>
  <div class="app-sidebar-menu" :class="{ 'app-sidebar-menu--collapsed': collapsed }">
    <div class="app-sidebar-menu__brand" :title="brandTitle">{{ collapsed ? '库存' : brandTitle }}</div>

    <el-menu
      router
      :default-active="activeMenu"
      class="app-sidebar-menu__menu"
      :collapse="collapsed"
      :collapse-transition="false"
    >
      <el-menu-item v-for="item in visibleItems" :key="item.index" :index="item.index" :title="collapsed ? item.label : undefined">
        <el-icon><component :is="item.icon" /></el-icon>
        <template #title>{{ item.label }}</template>
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
import { computed } from 'vue';
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
  Clock,
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
  canOperator: boolean;
  isAdmin: boolean;
  collapsed?: boolean;
  isMobile?: boolean;
}>();

defineEmits<{
  (e: 'toggle-collapse'): void;
}>();

type MenuItem = {
  index: string;
  label: string;
  icon: object;
  visible: boolean;
};

const brandTitle = '出入库管理';

const systemItems = computed<MenuItem[]>(() => [
  { index: '/system/home', label: '系统首页', icon: Setting, visible: true },
  { index: '/system/dashboard', label: '报表与看板', icon: DataAnalysis, visible: true },
  { index: '/system/reports', label: '数据报表中心', icon: Histogram, visible: true },
  { index: '/system/tasks', label: '批量任务中心', icon: Files, visible: true },
  { index: '/system/backup', label: '备份/恢复', icon: RefreshRight, visible: true },
  { index: '/system/audit', label: '审计日志', icon: Document, visible: true },
  { index: '/system/users', label: '用户管理', icon: User, visible: true },
  { index: '/system/settings', label: '系统配置', icon: Tools, visible: true },
  { index: '/system/tools', label: '运维工具', icon: Operation, visible: true },
  { index: '/system/release-check', label: '发布前检查', icon: FolderChecked, visible: true },
  { index: '/system/performance', label: '性能面板', icon: TrendCharts, visible: true },
  { index: '/system/docs', label: '系统交付文档', icon: Reading, visible: true },
]);

const partsItems = computed<MenuItem[]>(() => [
  { index: '/stock', label: '库存查询', icon: Box, visible: true },
  { index: '/tx', label: '出入库明细', icon: Document, visible: true },
  { index: '/warnings', label: '预警中心', icon: Warning, visible: true },
  { index: '/in', label: '入库', icon: Plus, visible: props.canOperator },
  { index: '/out', label: '出库', icon: Minus, visible: props.canOperator },
  { index: '/batch', label: '批量出入库', icon: Operation, visible: props.canOperator },
  { index: '/items', label: '配件管理', icon: Management, visible: props.isAdmin },
  { index: '/import/items', label: 'Excel 导入配件', icon: Upload, visible: props.isAdmin },
  { index: '/stocktake', label: '库存盘点', icon: Checked, visible: props.isAdmin },
  { index: '/system/home', label: '系统', icon: Setting, visible: props.isAdmin },
]);

const pcItems = computed<MenuItem[]>(() => [
  { index: '/pc/assets', label: '电脑台账', icon: Cpu, visible: props.canAccessPcLedger },
  { index: '/pc/age-warnings', label: '报废预警', icon: Warning, visible: props.canAccessPcLedger },
  { index: '/pc/tx', label: '电脑出入库明细', icon: Document, visible: props.canAccessPcLedger },
  { index: '/pc/inventory-logs', label: '盘点记录', icon: Checked, visible: props.canAccessPcLedger },
  { index: '/pc/monitors', label: '显示器台账', icon: Monitor, visible: props.canAccessMonitorLedger },
  { index: '/pc/monitor-tx', label: '显示器出入库明细', icon: Document, visible: props.canAccessMonitorLedger },
  { index: '/pc/monitor-inventory-logs', label: '显示器盘点记录', icon: Checked, visible: props.canAccessMonitorLedger },
  { index: '/pc/in', label: '电脑入库', icon: Plus, visible: props.canOperator && props.canAccessPcLedger },
  { index: '/pc/out', label: '电脑出库', icon: Minus, visible: props.canOperator && props.canAccessPcLedger },
  { index: '/pc/recycle', label: '电脑回收/归还', icon: RefreshRight, visible: props.canOperator && props.canAccessPcLedger },
  { index: '/system/home', label: '系统', icon: Setting, visible: props.isAdmin },
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
