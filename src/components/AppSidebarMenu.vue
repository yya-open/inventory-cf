<template>
  <div class="app-sidebar-menu" :class="{ 'app-sidebar-menu--collapsed': collapsed }">
    <div class="app-sidebar-menu__brand" :title="currentLabel">
      <span class="app-sidebar-menu__brand-text">出入库管理</span>
    </div>

    <el-menu
      router
      :default-active="activeMenu"
      :collapse="collapsed"
      :collapse-transition="false"
      class="app-sidebar-menu__menu"
    >
      <el-menu-item v-for="item in visibleItems" :key="item.index" :index="item.index">
        <el-icon><component :is="item.icon" /></el-icon>
        <template #title>{{ item.label }}</template>
      </el-menu-item>
    </el-menu>

    <div class="app-sidebar-menu__meta" :title="currentLabel">
      <span v-if="!collapsed">当前：{{ currentLabel }}</span>
    </div>

    <div class="app-sidebar-menu__footer">
      <button
        class="app-sidebar-menu__collapse-btn"
        type="button"
        :aria-label="collapsed ? '展开侧边栏' : '收起侧边栏'"
        :title="collapsed ? '展开侧边栏' : '收起侧边栏'"
        @click="$emit('toggle-collapse')"
      >
        <span class="app-sidebar-menu__collapse-icon" aria-hidden="true">{{ collapsed ? '›' : '‹' }}</span>
        <span v-if="!collapsed" class="app-sidebar-menu__collapse-text">收起侧边栏</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h } from 'vue';

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
}>();

defineEmits<{
  (e: 'toggle-collapse'): void;
}>();

type MenuItem = { index: string; label: string; icon: any; show?: boolean };

function createSvgIcon(inner: string) {
  return defineComponent({
    name: 'SidebarSvgIcon',
    render() {
      return h('svg', {
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.8',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        innerHTML: inner,
      });
    },
  });
}

const IconHome = createSvgIcon('<path d="M4 10.5 12 4l8 6.5"/><path d="M6.5 9.5V20h11V9.5"/>');
const IconChart = createSvgIcon('<path d="M5 19V9"/><path d="M12 19V5"/><path d="M19 19v-7"/><path d="M3 19h18"/>');
const IconDoc = createSvgIcon('<path d="M8 3h6l5 5v13H8z"/><path d="M14 3v5h5"/><path d="M10 13h6"/><path d="M10 17h6"/>');
const IconTask = createSvgIcon('<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 10h8"/><path d="M8 14h5"/>');
const IconRefresh = createSvgIcon('<path d="M20 6v6h-6"/><path d="M4 18v-6h6"/><path d="M18 12a6 6 0 0 0-10.24-4.24L6 9"/><path d="M6 12a6 6 0 0 0 10.24 4.24L18 15"/>');
const IconAudit = createSvgIcon('<path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/><rect x="5" y="3.5" width="14" height="17" rx="2"/>');
const IconUser = createSvgIcon('<circle cx="12" cy="8" r="3.5"/><path d="M5.5 19a6.5 6.5 0 0 1 13 0"/>');
const IconTools = createSvgIcon('<path d="M14.7 6.3a4 4 0 0 0 3 5.99L11 19l-3-3 6.72-6.72a4 4 0 0 0 0-2.98Z"/><path d="m5 21 2-2"/>');
const IconCheck = createSvgIcon('<path d="M20 6 9 17l-5-5"/>');
const IconFolder = createSvgIcon('<path d="M3 7h6l2 2h10v8.5A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5Z"/>');
const IconBox = createSvgIcon('<path d="m12 3 8 4.5-8 4.5-8-4.5Z"/><path d="M4 7.5V16.5L12 21l8-4.5V7.5"/><path d="M12 12v9"/>');
const IconList = createSvgIcon('<path d="M8 7h11"/><path d="M8 12h11"/><path d="M8 17h11"/><circle cx="4.5" cy="7" r=".8"/><circle cx="4.5" cy="12" r=".8"/><circle cx="4.5" cy="17" r=".8"/>');
const IconWarning = createSvgIcon('<path d="M12 4 3.8 18h16.4Z"/><path d="M12 9v4.5"/><path d="M12 17h.01"/>');
const IconIn = createSvgIcon('<path d="M12 19V5"/><path d="m7 10 5-5 5 5"/>');
const IconOut = createSvgIcon('<path d="M12 5v14"/><path d="m17 14-5 5-5-5"/>');
const IconBatch = createSvgIcon('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>');
const IconParts = createSvgIcon('<path d="M7 7h10v10H7z"/><path d="M4 10h3"/><path d="M17 10h3"/><path d="M10 4v3"/><path d="M14 17v3"/>');
const IconExcel = createSvgIcon('<path d="M8 3h8l4 4v14H8z"/><path d="M16 3v4h4"/><path d="m11 12 4 6"/><path d="m15 12-4 6"/>');
const IconMonitor = createSvgIcon('<rect x="4" y="5" width="16" height="10" rx="2"/><path d="M10 19h4"/><path d="M12 15v4"/>');
const IconCpu = createSvgIcon('<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 1v3"/><path d="M15 1v3"/><path d="M9 20v3"/><path d="M15 20v3"/><path d="M20 9h3"/><path d="M20 15h3"/><path d="M1 9h3"/><path d="M1 15h3"/>');
const IconSwap = createSvgIcon('<path d="M7 7h11"/><path d="m15 3 4 4-4 4"/><path d="M17 17H6"/><path d="m9 13-4 4 4 4"/>');

const systemItems = computed<MenuItem[]>(() => [
  { index: '/system/home', label: '系统首页', icon: IconHome },
  { index: '/system/dashboard', label: '报表与看板', icon: IconChart },
  { index: '/system/reports', label: '数据报表中心', icon: IconDoc },
  { index: '/system/tasks', label: '批量任务中心', icon: IconTask },
  { index: '/system/backup', label: '备份/恢复', icon: IconRefresh },
  { index: '/system/audit', label: '审计日志', icon: IconAudit },
  { index: '/system/users', label: '用户管理', icon: IconUser },
  { index: '/system/settings', label: '系统配置', icon: IconTools },
  { index: '/system/tools', label: '运维工具', icon: IconTools },
  { index: '/system/release-check', label: '发布前检查', icon: IconCheck },
  { index: '/system/performance', label: '性能面板', icon: IconChart },
  { index: '/system/docs', label: '系统交付文档', icon: IconFolder },
]);

const partsItems = computed<MenuItem[]>(() => [
  { index: '/stock', label: '库存查询', icon: IconBox },
  { index: '/tx', label: '出入库明细', icon: IconList },
  { index: '/warnings', label: '预警中心', icon: IconWarning },
  { index: '/in', label: '入库', icon: IconIn, show: props.canOperator },
  { index: '/out', label: '出库', icon: IconOut, show: props.canOperator },
  { index: '/batch', label: '批量出入库', icon: IconBatch, show: props.canOperator },
  { index: '/items', label: '配件管理', icon: IconParts, show: props.isAdmin },
  { index: '/import/items', label: 'Excel 导入配件', icon: IconExcel, show: props.isAdmin },
  { index: '/stocktake', label: '库存盘点', icon: IconCheck, show: props.isAdmin },
  { index: '/system/home', label: '系统', icon: IconTools, show: props.isAdmin },
].filter((item) => item.show !== false));

const pcItems = computed<MenuItem[]>(() => [
  { index: '/pc/assets', label: '电脑台账', icon: IconMonitor, show: props.canAccessPcLedger },
  { index: '/pc/age-warnings', label: '报废预警', icon: IconWarning, show: props.canAccessPcLedger },
  { index: '/pc/tx', label: '电脑出入库明细', icon: IconList, show: props.canAccessPcLedger },
  { index: '/pc/inventory-logs', label: '盘点记录', icon: IconCheck, show: props.canAccessPcLedger },
  { index: '/pc/monitors', label: '显示器台账', icon: IconCpu, show: props.canAccessMonitorLedger },
  { index: '/pc/monitor-tx', label: '显示器出入库明细', icon: IconDoc, show: props.canAccessMonitorLedger },
  { index: '/pc/monitor-inventory-logs', label: '显示器盘点记录', icon: IconCheck, show: props.canAccessMonitorLedger },
  { index: '/pc/in', label: '电脑入库', icon: IconIn, show: props.canOperator && props.canAccessPcLedger },
  { index: '/pc/out', label: '电脑出库', icon: IconOut, show: props.canOperator && props.canAccessPcLedger },
  { index: '/pc/recycle', label: '电脑回收/归还', icon: IconSwap, show: props.canOperator && props.canAccessPcLedger },
  { index: '/system/home', label: '系统', icon: IconTools, show: props.isAdmin },
].filter((item) => item.show !== false));

const visibleItems = computed(() => {
  if (props.isSystem) return systemItems.value;
  if (props.warehouseActive === 'parts' && props.canAccessPartsArea) return partsItems.value;
  if (props.canAccessPcArea) return pcItems.value;
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
