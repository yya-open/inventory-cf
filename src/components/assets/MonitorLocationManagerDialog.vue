<template>
  <el-dialog
    :model-value="visible"
    title="位置管理"
    width="720px"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="toolbar">
      <el-input
        :model-value="newName"
        placeholder="新增位置名称"
        class="name-input"
        :disabled="saving"
        @update:model-value="emit('update:new-name', $event || '')"
      />
      <el-select
        :model-value="parentId"
        clearable
        filterable
        placeholder="父级(可选)"
        class="parent-input"
        :disabled="saving"
        @update:model-value="emit('update:parent-id', $event || '')"
      >
        <el-option
          v-for="it in locationParentOptions"
          :key="it.value"
          :label="it.label"
          :value="it.value"
        />
      </el-select>
      <el-button
        type="primary"
        :loading="saving"
        @click="emit('create')"
      >
        新增
      </el-button>
    </div>
    <el-table
      :data="rows"
      size="small"
      border
    >
      <el-table-column
        type="index"
        label="序号"
        width="80"
      />
      <el-table-column
        label="位置"
        min-width="260"
      >
        <template #default="{ row }">
          {{ buildLocLabel(row) }}
        </template>
      </el-table-column>
      <el-table-column
        label="启用"
        width="100"
      >
        <template #default="{ row }">
          <el-switch
            v-model="row.enabled"
            :active-value="1"
            :inactive-value="0"
            :disabled="saving"
            @change="emit('update-location', row)"
          />
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        width="160"
      >
        <template #default="{ row }">
          <el-button
            v-if="isAdmin"
            size="small"
            type="danger"
            plain
            :disabled="saving"
            @click="emit('delete-location', row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button
        :disabled="saving"
        @click="emit('update:visible', false)"
      >
        关闭
      </el-button>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">defineProps<{ visible:boolean; rows:Array<Record<string,any>>; newName:string; parentId:string|number; locationParentOptions:Array<{value:number;label:string}>; isAdmin:boolean; buildLocLabel:(row:Record<string,any>)=>string; saving:boolean }>(); const emit = defineEmits<{ 'update:visible':[boolean]; 'update:new-name':[string]; 'update:parent-id':[string|number]; create:[]; 'update-location':[Record<string,any>]; 'delete-location':[Record<string,any>] }>();</script>
<style scoped>.toolbar{display:flex;gap:10px;align-items:center;margin-bottom:12px}.name-input{width:260px}.parent-input{width:220px}</style>
