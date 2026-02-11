<template>
  <el-card shadow="never" style="border: 1px solid #eee">
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap">
      <div style="font-weight:600">电脑仓（仓库2）</div>
      <el-tag type="info" effect="plain">子功能已合并到这里，避免与仓库1菜单混在一起</el-tag>
    </div>

    <div style="margin-top: 12px">
      <el-tabs v-model="tab" type="card" @tab-change="onTabChange">
        <el-tab-pane label="台账" name="assets" />
        <el-tab-pane label="明细" name="tx" />
        <el-tab-pane v-if="can('operator')" label="入库" name="in" />
        <el-tab-pane v-if="can('operator')" label="出库" name="out" />
        <el-tab-pane v-if="can('operator')" label="回收/归还" name="recycle" />
      </el-tabs>

      <div style="margin-top: 10px">
        <router-view />
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { can } from "../store/auth";

const route = useRoute();
const router = useRouter();

const tab = computed({
  get: () => {
    if (route.path === "/pc" || route.path === "/pc/") return "assets";
    if (route.path.startsWith("/pc/")) return route.path.slice("/pc/".length);
    return "assets";
  },
  set: (v: string) => {
    router.push(`/pc/${v}`);
  },
});

function onTabChange(name: string | number) {
  router.push(`/pc/${name}`);
}
</script>
