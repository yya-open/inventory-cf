<template>
  <div class="warehouse-select-page">
    <el-card class="warehouse-select-card" shadow="never">
      <div class="u-fw-700-fs-18-mb-6">
        选择要进入的仓库
      </div>
      <div class="u-text-subtle-13-mb-18">
        你可以随时在右上角切换
      </div>

      <el-row :gutter="16">
        <el-col
          v-if="canAccessParts"
          :xs="24"
          :sm="12"
        >
          <el-card
            class="warehouse-option-card"
            shadow="hover"
            @click="choose('parts')"
          >
            <div class="u-flex u-items-center u-gap-10">
              <span class="u-fs-22">📦</span>
              <div class="u-fw-700-fs-16">
                配件仓
              </div>
            </div>
            <div class="u-text-muted-13-leading-16-mt-10">
              库存查询、出入库明细、预警中心、入库/出库、批量出入库、配件管理、库存盘点等
            </div>
            <div class="u-mt-14">
              <el-button type="primary">
                进入配件仓
              </el-button>
            </div>
          </el-card>
        </el-col>

        <el-col
          v-if="canAccessPc"
          :xs="24"
          :sm="12"
          class="pc-col u-mt-12"
        >
          <el-card
            class="warehouse-option-card"
            shadow="hover"
            @click="choose('pc')"
          >
            <div class="u-flex u-items-center u-gap-10">
              <span class="u-fs-22">💻</span>
              <div class="u-fw-700-fs-16">
                电脑/显示器仓
              </div>
            </div>
            <div class="u-text-muted-13-leading-16-mt-10">
              电脑台账、显示器台账、出入库明细、盘点记录、导入/导出 Excel
            </div>
            <div class="u-mt-14">
              <el-button type="primary">
                进入电脑/显示器仓
              </el-button>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { setWarehouse, WarehouseKey } from "../store/warehouse";
import { useAuth } from "../store/auth";
import { canAccessModuleArea, preferredPcRoute } from "../utils/moduleAccess";

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const canAccessParts = computed(() => canAccessModuleArea(auth.user, "parts"));
const canAccessPc = computed(() => canAccessModuleArea(auth.user, "pc"));

function choose(k: WarehouseKey) {
  if (k === "parts" && !canAccessParts.value) return;
  if (k === "pc" && !canAccessPc.value) return;
  setWarehouse(k);
  const redirect = (route.query.redirect as string) || (k === "pc" ? preferredPcRoute(auth.user) : "/stock");
  router.replace(redirect);
}
</script>

<style scoped>
.warehouse-select-page{
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:24px 16px;
  background:
    
    var(--bg);
}
.warehouse-select-card{
  width:760px;
  max-width:100%;
  border-radius:var(--radius-xl);
  border:1px solid var(--border);
  box-shadow:var(--shadow-md);
}
.warehouse-option-card{
  height:100%;
  cursor:pointer;
  border-radius:var(--radius-lg);
  transition:border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}
.warehouse-option-card:hover{
  border-color:var(--brand);
  box-shadow:var(--shadow-sm);
  transform:translateY(-2px);
}
@media (min-width: 640px) {
  .pc-col { margin-top: 0 !important; }
}

@media (max-width: 640px) {
  .warehouse-select-page{
    align-items:stretch;
  }
  .warehouse-select-card :deep(.el-button){
    width:100%;
  }
}
</style>
