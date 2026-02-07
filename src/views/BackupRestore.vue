<template>
  <el-card>
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap">
      <div>
        <div style="font-weight:700; font-size:16px">备份 / 恢复</div>
        <div style="color:#888; font-size:12px; margin-top:6px; line-height:1.5">
          备份文件为 JSON（支持 <b>.json.gz</b> 压缩）。
          <b>恢复属于高风险操作</b>，请谨慎。
        </div>
      </div>
    </div>

    <el-divider />

    <el-row :gutter="16">
      <el-col :xs="24" :md="12">
        <el-card shadow="never" style="border:1px solid #f0f0f0">
          <template #header>
            <div style="display:flex; justify-content:space-between; align-items:center">
              <span style="font-weight:700">导出备份</span>
              <el-tag type="success" effect="light">推荐</el-tag>
            </div>
          </template>

          <div style="display:flex; flex-direction:column; gap:10px">
            <el-checkbox v-model="bk.include_tx">包含出入库明细（stock_tx，可能很大）</el-checkbox>
            <div
              v-if="bk.include_tx"
              style="display:flex; g
