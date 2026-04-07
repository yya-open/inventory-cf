<template>
  <div class="app-sidebar-menu">
    <div class="app-sidebar-menu__brand">出入库管理</div>

    <el-menu v-if="isSystem" router :default-active="activeMenu" class="app-sidebar-menu__menu">
      <el-menu-item index="/system/home">系统首页</el-menu-item>
      <el-menu-item index="/system/dashboard">报表与看板</el-menu-item>
      <el-menu-item index="/system/reports">数据报表中心</el-menu-item>
      <el-menu-item index="/system/tasks">批量任务中心</el-menu-item>
      <el-menu-item index="/system/backup">备份/恢复</el-menu-item>
      <el-menu-item index="/system/audit">审计日志</el-menu-item>
      <el-menu-item index="/system/users">用户管理</el-menu-item>
      <el-menu-item index="/system/settings">系统配置</el-menu-item>
      <el-menu-item index="/system/tools">运维工具</el-menu-item>
      <el-menu-item index="/system/release-check">发布前检查</el-menu-item>
      <el-menu-item index="/system/performance">性能面板</el-menu-item>
      <el-menu-item index="/system/docs">系统交付文档</el-menu-item>
    </el-menu>

    <el-menu v-else-if="warehouseActive === 'parts' && canAccessPartsArea" router :default-active="activeMenu" class="app-sidebar-menu__menu">
      <el-menu-item index="/stock">库存查询</el-menu-item>
      <el-menu-item index="/tx">出入库明细</el-menu-item>
      <el-menu-item index="/warnings">预警中心</el-menu-item>
      <el-menu-item v-if="canOperator" index="/in">入库</el-menu-item>
      <el-menu-item v-if="canOperator" index="/out">出库</el-menu-item>
      <el-menu-item v-if="canOperator" index="/batch">批量出入库</el-menu-item>
      <el-menu-item v-if="isAdmin" index="/items">配件管理</el-menu-item>
      <el-menu-item v-if="isAdmin" index="/import/items">Excel 导入配件</el-menu-item>
      <el-menu-item v-if="isAdmin" index="/stocktake">库存盘点</el-menu-item>
      <el-menu-item v-if="isAdmin" index="/system/home">系统</el-menu-item>
    </el-menu>

    <el-menu v-else-if="canAccessPcArea" router :default-active="activeMenu" class="app-sidebar-menu__menu">
      <el-menu-item v-if="canAccessPcLedger" index="/pc/assets">电脑台账</el-menu-item>
      <el-menu-item v-if="canAccessPcLedger" index="/pc/age-warnings">报废预警</el-menu-item>
      <el-menu-item v-if="canAccessPcLedger" index="/pc/tx">电脑出入库明细</el-menu-item>
      <el-menu-item v-if="canAccessPcLedger" index="/pc/inventory-logs">盘点记录</el-menu-item>
      <el-menu-item v-if="canAccessMonitorLedger" index="/pc/monitors">显示器台账</el-menu-item>
      <el-menu-item v-if="canAccessMonitorLedger" index="/pc/monitor-tx">显示器出入库明细</el-menu-item>
      <el-menu-item v-if="canAccessMonitorLedger" index="/pc/monitor-inventory-logs">显示器盘点记录</el-menu-item>
      <el-menu-item v-if="canOperator && canAccessPcLedger" index="/pc/in">电脑入库</el-menu-item>
      <el-menu-item v-if="canOperator && canAccessPcLedger" index="/pc/out">电脑出库</el-menu-item>
      <el-menu-item v-if="canOperator && canAccessPcLedger" index="/pc/recycle">电脑回收/归还</el-menu-item>
      <el-menu-item v-if="isAdmin" index="/system/home">系统</el-menu-item>
    </el-menu>

    <div class="app-sidebar-menu__meta">
      当前：{{ currentLabel }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

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
}>();

const currentLabel = computed(() => {
  if (props.isSystem) return '系统';
  if (props.warehouseActive === 'pc') {
    if (props.canAccessPcLedger && props.canAccessMonitorLedger) return '电脑/显示器仓';
    return props.canAccessPcLedger ? '电脑仓' : '显示器仓';
  }
  return '配件仓';
});
</script>
