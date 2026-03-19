<template>
  <el-dialog
    :model-value="visible"
    :title="mode==='create' ? '新增显示器台账' : '编辑显示器台账'"
    width="520px"
    @update:model-value="emit('update:visible', $event)"
  >
    <el-form label-width="90px">
      <el-form-item label="资产编号">
        <el-input
          v-model="form.asset_code"
          placeholder="必填"
        />
      </el-form-item>
      <el-form-item label="SN">
        <el-input
          v-model="form.sn"
          placeholder="可选"
        />
      </el-form-item>
      <el-form-item label="品牌">
        <el-select v-model="form.brand" filterable allow-create default-first-option clearable style="width:100%" placeholder="请选择或输入品牌">
          <el-option v-for="item in brandOptions" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>
      <el-form-item label="型号">
        <el-input v-model="form.model" />
      </el-form-item>
      <el-form-item label="尺寸">
        <el-input
          v-model="form.size_inch"
          placeholder="例如 27"
        />
      </el-form-item>
      <el-form-item label="位置">
        <el-select
          v-model="form.location_id"
          filterable
          clearable
          style="width:100%"
          placeholder="可选"
        >
          <el-option
            v-for="it in locationOptions"
            :key="it.value"
            :label="it.label"
            :value="it.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="备注">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="3"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button
        :disabled="saving"
        @click="emit('update:visible', false)"
      >
        取消
      </el-button>
      <el-button
        type="primary"
        :loading="saving"
        @click="emit('save')"
      >
        保存
      </el-button>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">defineProps<{ visible:boolean; mode:'create'|'edit'; form:Record<string,any>; locationOptions:Array<{value:number;label:string}>; brandOptions:string[]; saving:boolean }>(); const emit = defineEmits<{ 'update:visible':[boolean]; save:[] }>();</script>
