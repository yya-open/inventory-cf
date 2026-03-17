<template>
  <el-dialog
    :model-value="visible"
    title="修改电脑台账"
    width="680px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <el-form
      :model="form"
      label-width="90px"
    >
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="品牌">
            <el-input v-model="form.brand" />
          </el-form-item>
        </el-col><el-col :span="12">
          <el-form-item label="型号">
            <el-input v-model="form.model" />
          </el-form-item>
        </el-col><el-col :span="12">
          <el-form-item label="序列号">
            <el-input v-model="form.serial_no" />
          </el-form-item>
        </el-col><el-col :span="12">
          <el-form-item label="出厂时间">
            <el-input
              v-model="form.manufacture_date"
              placeholder="YYYY-MM-DD"
            />
          </el-form-item>
        </el-col><el-col :span="12">
          <el-form-item label="保修到期">
            <el-input
              v-model="form.warranty_end"
              placeholder="YYYY-MM-DD"
            />
          </el-form-item>
        </el-col><el-col :span="12">
          <el-form-item label="硬盘容量">
            <el-input v-model="form.disk_capacity" />
          </el-form-item>
        </el-col><el-col :span="12">
          <el-form-item label="内存大小">
            <el-input v-model="form.memory_size" />
          </el-form-item>
        </el-col><el-col :span="24">
          <el-form-item label="备注">
            <el-input
              v-model="form.remark"
              type="textarea"
              :rows="3"
            />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form><template #footer>
      <el-button @click="emit('update:visible', false)">
        取消
      </el-button><el-button
        type="primary"
        :loading="saving"
        @click="emit('save')"
      >
        保存
      </el-button>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">defineProps<{ visible:boolean; saving:boolean; form:Record<string,any> }>(); const emit = defineEmits<{ 'update:visible':[boolean]; save:[] }>();</script>
