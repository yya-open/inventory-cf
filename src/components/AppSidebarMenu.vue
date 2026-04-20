<template>
  <div class="app-sidebar-menu" :class="{ 'app-sidebar-menu--compact': compact }">
    <div class="app-sidebar-menu__brand">{{ compact ? '出' : '出入库管理' }}</div>

    <el-menu
      router
      :default-active="activeMenu"
      class="app-sidebar-menu__menu"
      :collapse="compact"
      :collapse-transition="false"
    >
      <template v-for="item in visibleMenuItems" :key="item.index">
        <el-tooltip v-if="compact" :content="item.label" placement="right">
          <el-menu-item :index="item.index">
            <el-icon><component :is="item.icon" /></el-icon>
            <template #title>{{ item.label }}</template>
          </el-menu-item>
        </el-tooltip>
        <el-menu-item v-else :index="item.index">
          <el-icon><component :is="item.icon" /></el-icon>
          <template #title>{{ item.label }}</template>
        </el-menu-item>
      </template>
    </el-menu>

    <div class="app-sidebar-menu__meta">
      <template v-if="compact">{{ currentLabelShort }}</template>
      <template v-else>当前：{{ currentLabel }}</template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  Box,
  Bottom,
  CircleCheck,
  Coin,
  Cpu,
  DataAnalysis,
  Document,
  Files,
  FolderChecked,
  Goods,
  Histogram,
  House,
  Monitor,
  Operation,
  PieChart,
  Plus,
  Reading,
  RefreshLeft,
  ScaleToOriginal,
  Search,
  Setting,
  Tickets,
  User,
  Warning,
} from '@element-plus/icons-vue';

type IconComponent = any;
type MenuItem = { index: string; label: string; icon: IconComponent; visible: boolean };

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
  compact?: boolean;
}>();

const visibleMenuItems = computed<MenuItem[]>(() => {
  const systemItems: MenuItem[] = [
    { index: '/system/home', label: '系统首页', icon: House, visible: true },
    { index: '/system/dashboard', label: '报表与看板', icon: DataAnalysis, visible: true },
    { index: '/system/reports', label: '数据报表中心', icon: PieChart, visible: true },
    { index: '/system/tasks', label: '批量任务中心', icon: FolderChecked, visible: true },
    { index: '/system/backup', label: '备份/恢复', icon: RefreshLeft, visible: true },
    { index: '/system/audit', label: '审计日志', icon: Reading, visible: true },
    { index: '/system/users', label: '用户管理', icon: User, visible: true },
    { index: '/system/settings', label: '系统配置', icon: Setting, visible: true },
    { index: '/system/tools', label: '运维工具', icon: Operation, visible: true },
    { index: '/system/release-check', label: '发布前检查', icon: CircleCheck, visible: true },
    { index: '/system/performance', label: '性能面板', icon: Histogram, visible: true },
    { index: '/system/docs', label: '系统交付文档', icon: Document, visible: true },
  ];

  const partsItems: MenuItem[] = [
    { index: '/stock', label: '库存查询', icon: Search, visible: props.canAccessPartsArea },
    { index: '/tx', label: '出入库明细', icon: Tickets, visible: props.canAccessPartsArea },
    { index: '/warnings', label: '预警中心', icon: Warning, visible: props.canAccessPartsArea },
    { index: '/in', label: '入库', icon: Plus, visible: props.canAccessPartsArea && props.canOperator },
    { index: '/out', label: '出库', icon: Bottom, visible: props.canAccessPartsArea && props.canOperator },
    { index: '/batch', label: '批量出入库', icon: Files, visible: props.canAccessPartsArea && props.canOperator },
    { index: '/items', label: '配件管理', icon: Box, visible: props.canAccessPartsArea && props.isAdmin },
    { index: '/import/items', label: 'Excel 导入配件', icon: Document, visible: props.canAccessPartsArea && props.isAdmin },
    { index: '/stocktake', label: '库存盘点', icon: ScaleToOriginal, visible: props.canAccessPartsArea && props.isAdmin },
    { index: '/system/home', label: '系统', icon: Setting, visible: props.canAccessPartsArea && props.isAdmin },
  ];

  const pcItems: MenuItem[] = [
    { index: '/pc/assets', label: '电脑台账', icon: Cpu, visible: props.canAccessPcArea && props.canAccessPcLedger },
    { index: '/pc/age-warnings', label: '报废预警', icon: Warning, visible: props.canAccessPcArea && props.canAccessPcLedger },
    { index: '/pc/tx', label: '电脑出入库明细', icon: Tickets, visible: props.canAccessPcArea && props.canAccessPcLedger },
    { index: '/pc/inventory-logs', label: '盘点记录', icon: ScaleToOriginal, visible: props.canAccessPcArea && props.canAccessPcLedger },
    { index: '/pc/monitors', label: '显示器台账', icon: Monitor, visible: props.canAccessPcArea && props.canAccessMonitorLedger },
    { index: '/pc/monitor-tx', label: '显示器出入库明细', icon: Goods, visible: props.canAccessPcArea && props.canAccessMonitorLedger },
    { index: '/pc/monitor-inventory-logs', label: '显示器盘点记录', icon: Coin, visible: props.canAccessPcArea && props.canAccessMonitorLedger },
    { index: '/pc/in', label: '电脑入库', icon: Plus, visible: props.canAccessPcArea && props.canOperator && props.canAccessPcLedger },
    { index: '/pc/out', label: '电脑出库', icon: Bottom, visible: props.canAccessPcArea && props.canOperator && props.canAccessPcLedger },
    { index: '/pc/recycle', label: '电脑回收/归还', icon: RefreshLeft, visible: props.canAccessPcArea && props.canOperator && props.canAccessPcLedger },
    { index: '/system/home', label: '系统', icon: Setting, visible: props.canAccessPcArea && props.isAdmin },
  ];

  const source = props.isSystem ? systemItems : props.warehouseActive === 'parts' ? partsItems : pcItems;
  return source.filter((item) => item.visible);
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
</script>
