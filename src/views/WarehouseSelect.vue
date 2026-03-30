<template>
  <div class="warehouse-page">
    <div class="warehouse-shell">
      <div class="warehouse-header">
        <div class="warehouse-header__eyebrow">WORKSPACE</div>
        <div class="warehouse-header__title">选择工作区</div>
        <div class="warehouse-header__desc">
          进入与你当前任务相符的仓库。登录后仍可在顶部导航中随时切换。
        </div>
      </div>

      <div class="warehouse-grid">
        <button
          v-if="canAccessParts"
          type="button"
          class="warehouse-card"
          @click="choose('parts')"
        >
          <div class="warehouse-card__icon">配</div>
          <div class="warehouse-card__body">
            <div class="warehouse-card__title">配件仓</div>
            <div class="warehouse-card__desc">
              库存查询、出入库明细、预警中心、入库/出库、批量出入库、配件管理与库存盘点。
            </div>
            <div class="warehouse-card__meta">
              <span class="warehouse-card__tag">库存</span>
              <span class="warehouse-card__tag">流转</span>
              <span class="warehouse-card__tag">盘点</span>
            </div>
          </div>
          <div class="warehouse-card__action">进入配件仓</div>
        </button>

        <button
          v-if="canAccessPc"
          type="button"
          class="warehouse-card"
          @click="choose('pc')"
        >
          <div class="warehouse-card__icon">终</div>
          <div class="warehouse-card__body">
            <div class="warehouse-card__title">电脑 / 显示器仓</div>
            <div class="warehouse-card__desc">
              电脑台账、显示器台账、流转记录、盘点记录，以及导入导出 Excel 等业务能力。
            </div>
            <div class="warehouse-card__meta">
              <span class="warehouse-card__tag">台账</span>
              <span class="warehouse-card__tag">盘点</span>
              <span class="warehouse-card__tag">导入导出</span>
            </div>
          </div>
          <div class="warehouse-card__action">进入电脑 / 显示器仓</div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { setWarehouse, type WarehouseKey } from "../store/warehouse";
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
.warehouse-page {
  min-height: 100vh;
  padding: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #f7f8fa 0%, #f2f4f7 100%);
}

.warehouse-shell {
  width: min(980px, 100%);
  padding: 32px;
  border-radius: 20px;
  border: 1px solid #e4e7ec;
  background: #ffffff;
  box-shadow: 0 12px 40px rgba(16, 24, 40, 0.06);
}

.warehouse-header__eyebrow {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #2f6bff;
}

.warehouse-header__title {
  margin-top: 10px;
  font-size: 30px;
  line-height: 1.2;
  font-weight: 700;
  color: #101828;
}

.warehouse-header__desc {
  margin-top: 10px;
  max-width: 680px;
  font-size: 14px;
  line-height: 1.8;
  color: #667085;
}

.warehouse-grid {
  margin-top: 28px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.warehouse-card {
  width: 100%;
  padding: 22px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 18px;
  border-radius: 16px;
  border: 1px solid #e4e7ec;
  background: #ffffff;
  cursor: pointer;
  text-align: left;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
}

.warehouse-card:hover {
  transform: translateY(-2px);
  border-color: #cfd4dc;
  box-shadow: 0 16px 36px rgba(16, 24, 40, 0.08);
}

.warehouse-card__icon {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: #eef4ff;
  color: #2f6bff;
  font-size: 18px;
  font-weight: 700;
}

.warehouse-card__body {
  min-width: 0;
}

.warehouse-card__title {
  font-size: 18px;
  font-weight: 700;
  color: #101828;
}

.warehouse-card__desc {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.8;
  color: #667085;
}

.warehouse-card__meta {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.warehouse-card__tag {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: #f2f4f7;
  color: #475467;
  font-size: 12px;
  font-weight: 600;
}

.warehouse-card__action {
  margin-top: auto;
  color: #2f6bff;
  font-size: 13px;
  font-weight: 700;
}

@media (max-width: 760px) {
  .warehouse-page {
    padding: 18px;
  }

  .warehouse-shell {
    padding: 24px;
  }

  .warehouse-grid {
    grid-template-columns: 1fr;
  }
}
</style>
