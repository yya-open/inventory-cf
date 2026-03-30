<template>
  <div style="height:100vh; display:flex; align-items:center; justify-content:center; background:#f7f8fa">
    <el-card style="width: 760px; max-width: calc(100vw - 32px)">
      <div style="font-size:18px; font-weight:700; margin-bottom:6px">
        选择要进入的仓库
      </div>
      <div style="color:#888; font-size:13px; margin-bottom:18px">
        你可以随时在右上角切换
      </div>

      <el-row :gutter="16">
        <el-col
          v-if="canAccessParts"
          :xs="24"
          :sm="12"
        >
          <el-card
            shadow="hover"
            style="cursor:pointer"
            @click="choose('parts')"
          >
            <div style="display:flex; align-items:center; gap:10px">
              <span style="font-size:22px">📦</span>
              <div style="font-weight:700; font-size:16px">
                配件仓
              </div>
            </div>
            <div style="margin-top:10px; color:#666; font-size:13px; line-height:1.6">
              库存查询、出入库明细、预警中心、入库/出库、批量出入库、配件管理、库存盘点等
            </div>
            <div style="margin-top:14px">
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
          style="margin-top:12px"
          class="pc-col"
        >
          <el-card
            shadow="hover"
            style="cursor:pointer"
            @click="choose('pc')"
          >
            <div style="display:flex; align-items:center; gap:10px">
              <span style="font-size:22px">💻</span>
              <div style="font-weight:700; font-size:16px">
                电脑/显示器仓
              </div>
            </div>
            <div style="margin-top:10px; color:#666; font-size:13px; line-height:1.6">
              电脑台账、显示器台账、出入库明细、盘点记录、导入/导出 Excel
            </div>
            <div style="margin-top:14px">
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
@media (min-width: 640px) {
  .pc-col { margin-top: 0 !important; }
}
</style>
