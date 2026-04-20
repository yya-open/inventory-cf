<template>
  <div class="app-sidebar-menu" :class="{ 'app-sidebar-menu--collapsed': collapsed }">
    <div class="app-sidebar-menu__brand">
      <span class="app-sidebar-menu__brand-mark">仓</span>
      <span v-if="!collapsed" class="app-sidebar-menu__brand-text">出入库管理</span>
    </div>

    <el-menu
      router
      :default-active="activeMenu"
      :collapse="collapsed"
      :collapse-transition="false"
      class="app-sidebar-menu__menu"
      :class="{ 'app-sidebar-menu__menu--collapsed': collapsed }"
    >
      <el-menu-item
        v-for="item in menuItems"
        :key="item.index"
        :index="item.index"
        :title="collapsed ? item.label : ''"
      >
        <el-icon class="app-sidebar-menu__item-icon"><component :is="item.icon" /></el-icon>
        <span class="app-sidebar-menu__item-text">{{ item.label }}</span>
      </el-menu-item>
    </el-menu>

    <div v-if="!collapsed" class="app-sidebar-menu__meta">
      当前：{{ currentLabel }}
    </div>

    <div v-if="showCollapseToggle !== false" class="app-sidebar-menu__footer">
      <button
        class="app-sidebar-menu__collapse-btn"
        :class="{ 'app-sidebar-menu__collapse-btn--collapsed': collapsed }"
        type="button"
        :aria-label="collapsed ? '展开侧边栏' : '收起侧边栏'"
        :title="collapsed ? '展开侧边栏' : '收起侧边栏'"
        @click="$emit('toggle-collapse')"
      >
        <el-icon class="app-sidebar-menu__collapse-icon"><component :is="collapsed ? ArrowRight : ArrowLeft" /></el-icon>
        <span v-if="!collapsed">收起侧边栏</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElIcon } from 'element-plus';
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Calendar,
  Download,
  DataAnalysis,
  Document,
  Files,
  FolderOpened,
  Grid,
  Histogram,
  Monitor,
  Setting,
  Tools,
  Upload,
  Warning,
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
  showCollapseToggle?: boolean;
}>();

defineEmits<{
  (e: 'toggle-collapse'): void;
}>();

type MenuItem = { index: string; label: string; icon: any };

const systemMenu = computed<MenuItem[]>(() => [
  { index: '/system/home', label: '系统首页', icon: Grid },
  { index: '/system/dashboard', label: '报表与看板', icon: DataAnalysis },
  { index: '/system/reports', label: '数据报表中心', icon: Histogram },
  { index: '/system/tasks', label: '批量任务中心', icon: Files },
  { index: '/system/backup', label: '备份/恢复', icon: FolderOpened },
  { index: '/system/audit', label: '审计日志', icon: Document },
  { index: '/system/users', label: '用户管理', icon: Tools },
  { index: '/system/settings', label: '系统配置', icon: Setting },
  { index: '/system/tools', label: '运维工具', icon: Tools },
  { index: '/system/release-check', label: '发布前检查', icon: Calendar },
  { index: '/system/performance', label: '性能面板', icon: DataAnalysis },
  { index: '/system/docs', label: '系统交付文档', icon: Files },
]);

const partsMenu = computed<MenuItem[]>(() => {
  const items: MenuItem[] = [
    { index: '/stock', label: '库存查询', icon: Box },
    { index: '/tx', label: '出入库明细', icon: Document },
    { index: '/warnings', label: '预警中心', icon: Warning },
  ];
  if (props.canOperator) {
    items.push(
      { index: '/in', label: '入库', icon: Upload },
      { index: '/out', label: '出库', icon: Download },
      { index: '/batch', label: '批量出入库', icon: Files },
    );
  }
  if (props.isAdmin) {
    items.push(
      { index: '/items', label: '配件管理', icon: Grid },
      { index: '/import/items', label: 'Excel 导入配件', icon: FolderOpened },
      { index: '/stocktake', label: '库存盘点', icon: Calendar },
      { index: '/system/home', label: '系统', icon: Setting },
    );
  }
  return items;
});

const pcMenu = computed<MenuItem[]>(() => {
  const items: MenuItem[] = [];
  if (props.canAccessPcLedger) {
    items.push(
      { index: '/pc/assets', label: '电脑台账', icon: Monitor },
      { index: '/pc/age-warnings', label: '报废预警', icon: Warning },
      { index: '/pc/tx', label: '电脑出入库明细', icon: Document },
      { index: '/pc/inventory-logs', label: '盘点记录', icon: Calendar },
    );
  }
  if (props.canAccessMonitorLedger) {
    items.push(
      { index: '/pc/monitors', label: '显示器台账', icon: Monitor },
      { index: '/pc/monitor-tx', label: '显示器出入库明细', icon: Document },
      { index: '/pc/monitor-inventory-logs', label: '显示器盘点记录', icon: Calendar },
    );
  }
  if (props.canOperator && props.canAccessPcLedger) {
    items.push(
      { index: '/pc/in', label: '电脑入库', icon: Upload },
      { index: '/pc/out', label: '电脑出库', icon: Download },
      { index: '/pc/recycle', label: '电脑回收/归还', icon: FolderOpened },
    );
  }
  if (props.isAdmin) items.push({ index: '/system/home', label: '系统', icon: Setting });
  return items;
});

const menuItems = computed<MenuItem[]>(() => {
  if (props.isSystem) return systemMenu.value;
  if (props.warehouseActive === 'parts' && props.canAccessPartsArea) return partsMenu.value;
  if (props.canAccessPcArea) return pcMenu.value;
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
</script>
