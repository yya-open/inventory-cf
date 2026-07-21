<template>
  <el-dialog
    v-model="visible"
    class="command-palette"
    :show-close="false"
    :width="isMobile ? 'calc(100vw - 24px)' : '640px'"
    :align-center="true"
    @opened="focusSearch"
  >
    <template #header>
      <div class="command-palette__header">
        <span>快速导航</span>
        <kbd>Esc</kbd>
      </div>
    </template>

    <el-input
      ref="searchRef"
      v-model="keyword"
      class="command-palette__search"
      placeholder="搜索页面或操作"
      clearable
      @keydown.enter="runFirst"
    >
      <template #prefix><Search /></template>
    </el-input>

    <div class="command-palette__hint">输入关键词后按 Enter 进入首个结果</div>

    <div class="command-palette__section">
      <div class="command-palette__section-title">快速操作</div>
      <button
        v-for="item in filteredQuickActions"
        :key="item.id"
        class="command-palette__item"
        type="button"
        @click="run(item)"
      >
        <span class="command-palette__icon"><component :is="item.icon" /></span>
        <span class="command-palette__copy">
          <strong>{{ item.label }}</strong>
          <small>{{ item.description }}</small>
        </span>
      </button>
      <el-empty v-if="!filteredQuickActions.length" :image-size="44" description="没有匹配的操作" />
    </div>

    <div class="command-palette__section">
      <div class="command-palette__section-title">可访问页面</div>
      <button
        v-for="item in filteredRoutes"
        :key="item.path"
        class="command-palette__item"
        type="button"
        @click="run(item)"
      >
        <span class="command-palette__icon"><component :is="item.icon" /></span>
        <span class="command-palette__copy">
          <strong>{{ item.label }}</strong>
          <small>{{ areaLabel(item.area) }}</small>
        </span>
      </button>
      <el-empty v-if="!filteredRoutes.length" :image-size="44" description="没有匹配的页面" />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Search, Plus, Minus, Warning, Box, Cpu, Monitor, Checked, DataAnalysis, Files } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';
import { MODULE_ROUTE_DEFS, type ModuleArea, type ModuleRouteDefinition } from '../router/moduleRouteManifest';
import { canAccessModuleArea, canAccessPcSection, canAccessSystemArea } from '../utils/moduleAccess';
import { hasCapability } from '../domain/capabilities';
import { hasPermission } from '../utils/permissions';
import { hasRole } from '../utils/roles';
import type { User } from '../store/auth';

type Command = {
  id: string;
  label: string;
  description: string;
  path: string;
  icon: object;
  area?: ModuleArea;
};

const props = defineProps<{ user: User | null; isMobile?: boolean }>();
const visible = defineModel<boolean>('visible', { default: false });
const router = useRouter();
const keyword = ref('');
const searchRef = ref<any>(null);

const iconMap: Record<string, object> = {
  box: Box, cpu: Cpu, monitor: Monitor, warning: Warning, plus: Plus, minus: Minus,
  checked: Checked, 'data-analysis': DataAnalysis, files: Files,
};

function allowed(item: ModuleRouteDefinition) {
  const user = props.user;
  if (!user) return false;
  if (item.area === 'system' && !canAccessSystemArea(user)) return false;
  if (item.area === 'parts' && !canAccessModuleArea(user, 'parts')) return false;
  if (item.area === 'pc') {
    if (!canAccessModuleArea(user, 'pc')) return false;
    if (item.pcSection && !canAccessPcSection(user, item.pcSection)) return false;
  }
  if (item.minRole && !hasRole(user.role, item.minRole)) return false;
  if (item.permission && !hasPermission(user, item.permission)) return false;
  return !item.capability || hasCapability(user, item.capability);
}

const quickActions = computed<Command[]>(() => [
  { id: 'stock-in', label: '配件入库', description: '录入到货或补货', path: '/in', icon: Plus, area: 'parts' },
  { id: 'stock-out', label: '配件出库', description: '登记领用或出库', path: '/out', icon: Minus, area: 'parts' },
  { id: 'pc-in', label: '电脑入库', description: '新增电脑资产', path: '/pc/in', icon: Plus, area: 'pc' },
  { id: 'pc-out', label: '电脑出库', description: '办理领用或配置', path: '/pc/out', icon: Minus, area: 'pc' },
  { id: 'warnings', label: '处理库存预警', description: '查看缺货与补货优先级', path: '/warnings', icon: Warning, area: 'parts' },
  { id: 'asset-inventory', label: '资产盘点', description: '查看或启动资产盘点', path: '/pc/assets', icon: Checked, area: 'pc' },
]);

const routes = computed<Command[]>(() => MODULE_ROUTE_DEFS.filter((item) => item.accessibleSummary && allowed(item)).map((item) => ({
  id: item.code,
  label: item.label,
  description: '',
  path: item.path,
  icon: iconMap[item.icon] || Box,
  area: item.area,
})));

function matches(item: Command) {
  const q = keyword.value.trim().toLowerCase();
  return !q || `${item.label} ${item.description} ${areaLabel(item.area)}`.toLowerCase().includes(q);
}

const filteredQuickActions = computed(() => quickActions.value.filter((item) => {
  if (!matches(item)) return false;
  const route = MODULE_ROUTE_DEFS.find((candidate) => candidate.path === item.path);
  return route ? allowed(route) : false;
}));
const filteredRoutes = computed(() => routes.value.filter(matches));

function areaLabel(area?: ModuleArea) {
  return area === 'parts' ? '配件仓' : area === 'pc' ? '电脑与显示器仓' : '系统管理';
}

function run(item: Command) {
  visible.value = false;
  void router.push(item.path);
}

function runFirst() {
  const item = filteredQuickActions.value[0] || filteredRoutes.value[0];
  if (item) run(item);
}

function focusSearch() {
  void nextTick(() => searchRef.value?.focus?.());
}

watch(visible, (open) => {
  if (!open) keyword.value = '';
});
</script>

<style scoped>
.command-palette__header { display: flex; align-items: center; justify-content: space-between; font-weight: 700; }
kbd { padding: 2px 6px; border: 1px solid var(--border); border-radius: var(--radius-xs); color: var(--muted); font-size: 11px; font-weight: 600; }
.command-palette__search { margin-bottom: 8px; }
.command-palette__hint { margin-bottom: 16px; color: var(--muted); font-size: 12px; }
.command-palette__section + .command-palette__section { margin-top: 18px; }
.command-palette__section-title { margin-bottom: 6px; color: var(--subtle); font-size: 12px; font-weight: 700; }
.command-palette__item { display: flex; width: 100%; gap: 12px; align-items: center; padding: 10px; border: 0; border-radius: var(--radius-sm); background: transparent; color: inherit; text-align: left; cursor: pointer; }
.command-palette__item:hover, .command-palette__item:focus-visible { outline: none; background: var(--surface-tint); }
.command-palette__icon { display: grid; width: 30px; height: 30px; place-items: center; border: 1px solid var(--border-soft); border-radius: var(--radius-sm); color: var(--brand); background: var(--surface); }
.command-palette__copy { display: grid; min-width: 0; gap: 2px; }
.command-palette__copy strong { font-size: 13px; }
.command-palette__copy small { color: var(--muted); font-size: 12px; }
</style>
