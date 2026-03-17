<template>
  <div>
    <el-table :data="rows" border v-loading="loading">
      <el-table-column label="ID" width="80"><template #default="{ $index }">{{ (page - 1) * pageSize + $index + 1 }}</template></el-table-column>
      <el-table-column label="电脑" min-width="260"><template #default="{ row }"><div class="asset-link strong" @click="emit('open-info', row)">{{ row.brand }} · {{ row.model }}</div><div class="asset-link subtle" @click="emit('open-info', row)">SN：{{ row.serial_no }}</div></template></el-table-column>
      <el-table-column label="配置" width="170"><template #default="{ row }"><div>{{ row.disk_capacity || '-' }} / {{ row.memory_size || '-' }}</div><div class="subtle">保修：{{ row.warranty_end || '-' }}</div></template></el-table-column>
      <el-table-column label="状态" width="120"><template #default="{ row }"><el-tag v-if="row.status==='IN_STOCK'" type="success">在库</el-tag><el-tag v-else-if="row.status==='ASSIGNED'" type="warning">已领用</el-tag><el-tag v-else-if="row.status==='RECYCLED'" type="info">已回收</el-tag><el-tag v-else type="danger">已报废</el-tag></template></el-table-column>
      <el-table-column label="当前领用人" width="220"><template #default="{ row }"><div v-if="row.status==='ASSIGNED'"><div class="strong">{{ row.last_employee_name || '-' }}</div><div class="subtle">{{ row.last_employee_no || '-' }} · {{ row.last_department || '-' }}</div></div><span v-else>-</span></template></el-table-column>
      <el-table-column prop="last_config_date" label="配置日期" width="130" />
      <el-table-column prop="last_recycle_date" label="回收日期" width="130" />
      <el-table-column prop="remark" label="备注" min-width="220" show-overflow-tooltip />
      <el-table-column v-if="canOperator" label="操作" width="220" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="emit('open-edit', row)">修改</el-button><el-button link @click="emit('open-qr', row)">二维码</el-button><el-button v-if="isAdmin" link type="danger" @click="emit('remove', row)">删除</el-button></template></el-table-column>
    </el-table>
    <div class="pager-wrap"><el-pagination :current-page="page" :page-size="pageSize" :total="total" background layout="total, sizes, prev, pager, next, jumper" :page-sizes="[20,50,100,200]" @update:current-page="(value: number) => emit('page-change', value)" @update:page-size="(value: number) => emit('page-size-change', value)" /></div>
  </div>
</template>
<script setup lang="ts">
defineProps<{ rows:Array<Record<string, any>>; loading:boolean; page:number; pageSize:number; total:number; canOperator:boolean; isAdmin:boolean }>();
const emit = defineEmits<{ 'open-info':[Record<string,any>]; 'open-edit':[Record<string,any>]; 'open-qr':[Record<string,any>]; remove:[Record<string,any>]; 'page-change':[number]; 'page-size-change':[number] }>();
</script>
<style scoped>.pager-wrap{display:flex;justify-content:flex-end;margin-top:12px}.asset-link{cursor:pointer}.strong{font-weight:600}.subtle{color:#999;font-size:12px}</style>
