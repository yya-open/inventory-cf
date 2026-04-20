<template>
  <div class="app-sidebar-menu" :class="{ 'app-sidebar-menu--collapsed': collapsed }">
    <div class="app-sidebar-menu__brand" :title="currentLabel">
      <span class="app-sidebar-menu__brand-badge" aria-hidden="true">
        <svg viewBox="0 0 24 24" class="app-sidebar-menu__svg">
          <path d="M5 7.5 12 4l7 3.5v9L12 20l-7-3.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
          <path d="M12 4v16M5 7.5l7 3.5 7-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <span v-if="!collapsed">出入库管理</span>
    </div>

    <el-menu
      router
      :default-active="activeMenu"
      class="app-sidebar-menu__menu"
      :class="{ 'app-sidebar-menu__menu--collapsed': collapsed }"
      :collapse="collapsed"
      :collapse-transition="false"
    >
      <template v-for="item in visibleItems" :key="item.index">
        <el-menu-item :index="item.index" :title="item.label">
          <span class="app-sidebar-menu__item-icon" aria-hidden="true" v-html="iconSvg(item.icon)" />
          <template #title>
            <span>{{ item.label }}</span>
          </template>
        </el-menu-item>
      </template>
    </el-menu>

    <div v-if="!collapsed" class="app-sidebar-menu__meta">
      当前：{{ currentLabel }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type IconName =
  | 'home'
  | 'chart'
  | 'report'
  | 'tasks'
  | 'backup'
  | 'audit'
  | 'users'
  | 'settings'
  | 'tools'
  | 'rocket'
  | 'pulse'
  | 'docs'
  | 'stock'
  | 'tx'
  | 'warning'
  | 'in'
  | 'out'
  | 'batch'
  | 'parts'
  | 'excel'
  | 'checklist'
  | 'pc'
  | 'monitor'
  | 'recycle';

interface MenuItemDef {
  index: string;
  label: string;
  icon: IconName;
  show: boolean;
}

const props = withDefaults(defineProps<{
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
}>(), {
  collapsed: false,
});

const currentLabel = computed(() => {
  if (props.isSystem) return '系统';
  if (props.warehouseActive === 'pc') {
    if (props.canAccessPcLedger && props.canAccessMonitorLedger) return '电脑/显示器仓';
    return props.canAccessPcLedger ? '电脑仓' : '显示器仓';
  }
  return '配件仓';
});

const visibleItems = computed<MenuItemDef[]>(() => {
  if (props.isSystem) {
    return [
      { index: '/system/home', label: '系统首页', icon: 'home', show: true },
      { index: '/system/dashboard', label: '报表与看板', icon: 'chart', show: true },
      { index: '/system/reports', label: '数据报表中心', icon: 'report', show: true },
      { index: '/system/tasks', label: '批量任务中心', icon: 'tasks', show: true },
      { index: '/system/backup', label: '备份/恢复', icon: 'backup', show: true },
      { index: '/system/audit', label: '审计日志', icon: 'audit', show: true },
      { index: '/system/users', label: '用户管理', icon: 'users', show: true },
      { index: '/system/settings', label: '系统配置', icon: 'settings', show: true },
      { index: '/system/tools', label: '运维工具', icon: 'tools', show: true },
      { index: '/system/release-check', label: '发布前检查', icon: 'rocket', show: true },
      { index: '/system/performance', label: '性能面板', icon: 'pulse', show: true },
      { index: '/system/docs', label: '系统交付文档', icon: 'docs', show: true },
    ];
  }
  if (props.warehouseActive === 'parts' && props.canAccessPartsArea) {
    return [
      { index: '/stock', label: '库存查询', icon: 'stock', show: true },
      { index: '/tx', label: '出入库明细', icon: 'tx', show: true },
      { index: '/warnings', label: '预警中心', icon: 'warning', show: true },
      { index: '/in', label: '入库', icon: 'in', show: props.canOperator },
      { index: '/out', label: '出库', icon: 'out', show: props.canOperator },
      { index: '/batch', label: '批量出入库', icon: 'batch', show: props.canOperator },
      { index: '/items', label: '配件管理', icon: 'parts', show: props.isAdmin },
      { index: '/import/items', label: 'Excel 导入配件', icon: 'excel', show: props.isAdmin },
      { index: '/stocktake', label: '库存盘点', icon: 'checklist', show: props.isAdmin },
      { index: '/system/home', label: '系统', icon: 'settings', show: props.isAdmin },
    ].filter((item) => item.show);
  }
  return [
    { index: '/pc/assets', label: '电脑台账', icon: 'pc', show: props.canAccessPcLedger },
    { index: '/pc/age-warnings', label: '报废预警', icon: 'warning', show: props.canAccessPcLedger },
    { index: '/pc/tx', label: '电脑出入库明细', icon: 'tx', show: props.canAccessPcLedger },
    { index: '/pc/inventory-logs', label: '盘点记录', icon: 'checklist', show: props.canAccessPcLedger },
    { index: '/pc/monitors', label: '显示器台账', icon: 'monitor', show: props.canAccessMonitorLedger },
    { index: '/pc/monitor-tx', label: '显示器出入库明细', icon: 'tx', show: props.canAccessMonitorLedger },
    { index: '/pc/monitor-inventory-logs', label: '显示器盘点记录', icon: 'checklist', show: props.canAccessMonitorLedger },
    { index: '/pc/in', label: '电脑入库', icon: 'in', show: props.canOperator && props.canAccessPcLedger },
    { index: '/pc/out', label: '电脑出库', icon: 'out', show: props.canOperator && props.canAccessPcLedger },
    { index: '/pc/recycle', label: '电脑回收/归还', icon: 'recycle', show: props.canOperator && props.canAccessPcLedger },
    { index: '/system/home', label: '系统', icon: 'settings', show: props.isAdmin },
  ].filter((item) => item.show);
});

const ICONS: Record<IconName, string> = {
  home: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><path d="M4 11.2 12 4l8 7.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 10.5V19h11v-8.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chart: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><path d="M5 18V8M12 18V5M19 18v-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 19.5h16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  report: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><path d="M7 4.5h7l3 3V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 11h6M9 15h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  tasks: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><path d="M9 7h9M9 12h9M9 17h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m5 7 1.2 1.2L8.5 6M5 12l1.2 1.2L8.5 11M5 17l1.2 1.2L8.5 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  backup: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><path d="M12 5a7 7 0 1 0 6.7 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 2.8v4.4h4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  audit: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><circle cx="11" cy="11" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m20 20-4.2-4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  users: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><circle cx="9" cy="9" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 18a4.8 4.8 0 0 1 9 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M16.5 8.2a2.5 2.5 0 0 1 0 5M18.2 18a4 4 0 0 0-2.3-3.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  settings: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 4.5v2.1M12 17.4v2.1M4.5 12h2.1M17.4 12h2.1M6.7 6.7l1.5 1.5M15.8 15.8l1.5 1.5M17.3 6.7l-1.5 1.5M8.2 15.8l-1.5 1.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  tools: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><path d="m14.5 5.5 4 4-6.8 6.8-4-4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m8.6 11.4-2.1-2.1a2 2 0 1 1 2.8-2.8l2.1 2.1M13 16l4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  rocket: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><path d="M13.5 5.2c2.8-.6 5.3.4 5.3.4s1 2.5.4 5.3L14 16.1l-6.1-6.1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m9.2 14.8-2.8 2.8M6.5 13.4l-1.7-1.7 3.3-1.2M12.3 19.2l-1.2-3.3 3.3-1.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pulse: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><path d="M3.5 12h4l2-4 4.2 8 2.1-4H20.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  docs: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><path d="M7 4.5h10a1 1 0 0 1 1 1V18.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 8.5h6M9 12h6M9 15.5h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  stock: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><path d="M5 7.5 12 4l7 3.5v9L12 20l-7-3.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M5 11l7 3.5 7-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  tx: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><path d="M5 7h14M5 12h14M5 17h9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m15 5 4 2-4 2M10 15l-4 2 4 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warning: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><path d="m12 4 8 14H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9v4.5M12 17.2h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  in: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><path d="M12 19V6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m7.5 10.5 4.5-4.5 4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19h14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  out: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><path d="M12 5v13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m7.5 13.5 4.5 4.5 4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 5h14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  batch: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><rect x="4.5" y="5" width="6" height="6" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="13.5" y="5" width="6" height="6" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="9" y="13" width="6" height="6" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  parts: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><path d="M8.5 7.5 6 10l3 3 2.5-2.5M15.5 7.5 18 10l-3 3-2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="m10.5 14.5 3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  excel: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><path d="M7 4.5h10a1 1 0 0 1 1 1V18.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m9 8.5 4 7M13 8.5l-4 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  checklist: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><path d="M9 7h8M9 12h8M9 17h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m5 7 1.2 1.2L7.9 6.5M5 12l1.2 1.2L7.9 11.5M5 17l1.2 1.2L7.9 16.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pc: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><rect x="4.5" y="5.5" width="15" height="10" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 19h6M7.5 15.5h9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  monitor: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><rect x="3.8" y="5" width="16.4" height="11" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 16v2.6M8.5 19.2h7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  recycle: '<svg viewBox="0 0 24 24" class="app-sidebar-menu__svg"><path d="M8.2 6.4 12 4l3.2 2.1M15.8 17.6 12 20l-3.2-2.1M18.6 9.2 20 13l-2.4 3.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 7H5.5L4 10M19 13h-3.5L13.8 9.8M10.2 14.2 8.5 17H12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function iconSvg(name: IconName) {
  return ICONS[name];
}
</script>
