<template>
  <el-container style="height: 100vh">
    <el-aside width="220px" style="border-right: 1px solid #eee">
      <div style="padding: 14px; font-weight: 700">出入库管理</div>
      <el-menu router :default-active="$route.path">
        <el-menu-item index="/stock">库存查询</el-menu-item>
        <el-menu-item index="/in">入库</el-menu-item>
        <el-menu-item index="/out">出库</el-menu-item>
        <el-menu-item index="/tx">出入库明细</el-menu-item>
        <el-menu-item index="/warnings">预警中心</el-menu-item>
        <el-menu-item index="/items">配件管理</el-menu-item>
      </el-menu>
      <div style="padding: 12px; color: #999; font-size: 12px">
        默认仓库：主仓（id=1）
      </div>
    </el-aside>
    <el-container>
      <el-header style="border-bottom: 1px solid #eee; display: flex; align-items: center">
        <div style="font-weight: 600">{{ title }}</div>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
const route = useRoute();
const title = computed(() => {
  const map: Record<string, string> = {
    "/stock": "库存查询",
    "/in": "入库",
    "/out": "出库",
    "/tx": "出入库明细",
    "/warnings": "预警中心",
    "/items": "配件管理",
  };
  return map[route.path] || "系统";
});
</script>
