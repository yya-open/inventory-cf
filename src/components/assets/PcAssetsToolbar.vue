<template>
  <div class="asset-toolbar">
    <div class="toolbar-left">
      <div class="toolbar-block toolbar-search">
        <div class="toolbar-block-title">
          筛选查询
        </div>
        <div class="toolbar-row">
          <el-select
            :model-value="status"
            placeholder="状态"
            clearable
            class="toolbar-select"
            @update:model-value="emit('update:status', $event || '')"
            @change="emit('search')"
          >
            <el-option
              label="在库"
              value="IN_STOCK"
            />
            <el-option
              label="已领用"
              value="ASSIGNED"
            />
            <el-option
              label="已回收"
              value="RECYCLED"
            />
            <el-option
              label="已报废"
              value="SCRAPPED"
            />
          </el-select>
          <el-input
            :model-value="keyword"
            clearable
            placeholder="关键词：序列号/品牌/型号/备注"
            class="toolbar-input"
            @update:model-value="emit('update:keyword', $event || '')"
            @keyup.enter="emit('search')"
          />
          <div class="toolbar-actions-inline">
            <el-button
              type="primary"
              @click="emit('search')"
            >
              查询
            </el-button>
            <el-button @click="emit('reset')">
              重置
            </el-button>
          </div>
        </div>
      </div>
    </div>
    <div class="toolbar-right">
      <div class="toolbar-block toolbar-tools">
        <div class="toolbar-block-title">
          快捷工具
        </div>
        <div class="toolbar-tool-grid">
          <el-button @click="emit('export')">
            导出Excel
          </el-button>
          <el-button
            v-if="isAdmin"
            @click="emit('init-qr')"
          >
            初始化二维码Key
          </el-button>
          <el-button
            v-if="canOperator"
            @click="emit('download-template')"
          >
            下载导入模板
          </el-button>
          <el-upload
            v-if="canOperator"
            class="toolbar-upload"
            :show-file-list="false"
            :auto-upload="false"
            accept=".xlsx,.xls"
            :on-change="(file: unknown) => emit('import-file', file)"
          >
            <el-button type="primary">
              Excel导入（批量入库）
            </el-button>
          </el-upload>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
defineProps<{ status: string; keyword: string; isAdmin: boolean; canOperator: boolean }>();
const emit = defineEmits<{ 'update:status':[string]; 'update:keyword':[string]; search:[]; reset:[]; export:[]; 'init-qr':[]; 'download-template':[]; 'import-file':[unknown] }>();
</script>
<style scoped>
.asset-toolbar{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(280px,.9fr);gap:16px;margin-bottom:16px}.toolbar-left,.toolbar-right{min-width:0}.toolbar-left{display:flex;flex-direction:column;gap:12px}.toolbar-block{padding:14px 16px;border:1px solid #ebeef5;border-radius:16px;background:linear-gradient(180deg,#fff 0%,#fafcff 100%)}.toolbar-block-title{margin-bottom:10px;font-size:13px;font-weight:700;color:#606266}.toolbar-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.toolbar-select{width:160px}.toolbar-input{width:300px;max-width:100%}.toolbar-actions-inline{display:flex;gap:12px;flex-wrap:wrap}.toolbar-tool-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}.toolbar-tool-grid :deep(.el-button){margin-left:0;width:100%}.toolbar-tool-grid :deep(.el-upload),.toolbar-tool-grid :deep(.el-upload .el-button){width:100%}@media (max-width:1100px){.asset-toolbar{grid-template-columns:1fr}}@media (max-width:768px){.toolbar-block{padding:12px;border-radius:14px}.toolbar-select,.toolbar-input,.toolbar-actions-inline,.toolbar-actions-inline :deep(.el-button){width:100%}}
</style>
