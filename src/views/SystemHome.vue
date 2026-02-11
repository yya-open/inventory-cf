<template>
  <div style="max-width: 1040px; margin: 0 auto">
    <el-card shadow="never" style="border-radius: 12px">
      <template #header>
        <div style="display:flex; align-items:center; justify-content:space-between">
          <div style="font-weight:700; font-size:16px">系统</div>
          <div style="display:flex; gap:8px">
            <el-button size="small" @click="go('/stock')">进入配件仓</el-button>
            <el-button size="small" @click="go('/pc/assets')">进入电脑仓</el-button>
          </div>
        </div>
      </template>

      <el-alert
        title="以下功能为系统级配置/维护项，已从侧边栏主菜单收纳到此页面。"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 14px"
      />

      <el-row :gutter="12">
        <el-col :xs="24" :sm="12" :md="12" :lg="8">
          <el-card shadow="never" style="border-radius: 12px; height: 100%">
            <div style="font-weight:700; margin-bottom: 8px">Excel 导入配件</div>
            <div style="color:#777; font-size: 12px; margin-bottom: 12px">批量导入配件基础数据（SKU/名称/品牌/型号…）</div>
            <el-button type="primary" plain size="small" @click="go('/system/import')">打开</el-button>
          </el-card>
        </el-col>

        <el-col :xs="24" :sm="12" :md="12" :lg="8">
          <el-card shadow="never" style="border-radius: 12px; height: 100%">
            <div style="font-weight:700; margin-bottom: 8px">备份 / 恢复</div>
            <div style="color:#777; font-size: 12px; margin-bottom: 12px">创建备份、恢复任务、下载备份文件</div>
            <el-button type="primary" plain size="small" @click="go('/system/backup')">打开</el-button>
          </el-card>
        </el-col>

        <el-col :xs="24" :sm="12" :md="12" :lg="8">
          <el-card shadow="never" style="border-radius: 12px; height: 100%">
            <div style="font-weight:700; margin-bottom: 8px">审计日志</div>
            <div style="color:#777; font-size: 12px; margin-bottom: 12px">查看用户操作记录、筛选与导出</div>
            <el-button type="primary" plain size="small" @click="go('/system/audit')">打开</el-button>
          </el-card>
        </el-col>

        <el-col :xs="24" :sm="12" :md="12" :lg="8" style="margin-top: 12px">
          <el-card shadow="never" style="border-radius: 12px; height: 100%">
            <div style="font-weight:700; margin-bottom: 8px">用户管理</div>
            <div style="color:#777; font-size: 12px; margin-bottom: 12px">新增/编辑用户、角色管理</div>
            <el-button type="primary" plain size="small" @click="go('/system/users')">打开</el-button>
          </el-card>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();
const go = (path: string) => router.push(path);
</script>
