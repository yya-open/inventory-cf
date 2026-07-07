<template>
  <div class="ui-page-shell ownership-page">
    <section class="ui-page-heading ownership-heading">
      <div class="ui-page-heading__main">
        <div class="ui-page-heading__kicker">资产归属</div>
        <div class="ui-page-heading__title">人员 / 部门资产视图</div>
        <div class="ui-page-heading__desc">按当前领用人或部门查看电脑与显示器，并追踪单台资产的完整生命周期。</div>
      </div>
      <div class="ownership-heading__meta">
        <el-tag type="info" effect="plain">分组 {{ overview.summary.groups }}</el-tag>
        <el-tag type="primary" effect="plain">资产 {{ overview.summary.total }}</el-tag>
        <el-tag effect="plain">电脑 {{ overview.summary.pc }}</el-tag>
        <el-tag effect="plain">显示器 {{ overview.summary.monitor }}</el-tag>
      </div>
    </section>

    <section class="ownership-toolbar">
      <el-segmented
        v-model="groupBy"
        :options="groupModeOptions"
        class="ownership-toolbar__segment"
      />
      <el-segmented
        v-model="kind"
        :options="kindOptions"
        class="ownership-toolbar__segment"
      />
      <el-input
        v-model="keywordInput"
        clearable
        class="ownership-toolbar__search"
        placeholder="搜索人员、部门、资产编号、品牌型号"
        @keyup.enter="applySearch"
        @clear="applySearch"
      />
      <el-button type="primary" :loading="loading" @click="applySearch">查询</el-button>
      <el-button :loading="loading" @click="reload">刷新</el-button>
    </section>

    <section class="ownership-workspace">
      <aside class="ownership-groups">
        <div class="panel-heading">
          <div class="panel-heading__title">{{ groupBy === 'person' ? '人员' : '部门' }}</div>
          <div class="panel-heading__sub">{{ loading ? '加载中' : `${filteredGroups.length} 个分组` }}</div>
        </div>
        <el-skeleton v-if="loading && !overview.groups.length" animated :rows="8" />
        <el-empty v-else-if="!filteredGroups.length" description="暂无匹配分组" />
        <div v-else class="group-list">
          <button
            v-for="group in filteredGroups"
            :key="group.key"
            type="button"
            class="group-row"
            :class="{ 'group-row--active': selectedGroupKey === group.key }"
            @click="selectGroup(group.key)"
          >
            <span class="group-row__main">
              <span class="group-row__label">{{ group.label || '-' }}</span>
              <span class="group-row__sub">
                <template v-if="groupBy === 'person'">{{ group.department || '未填写部门' }}</template>
                <template v-else>{{ group.total }} 台当前资产</template>
              </span>
            </span>
            <span class="group-row__counts">
              <b>{{ group.total }}</b>
              <small>{{ group.pc_count }} / {{ group.monitor_count }}</small>
            </span>
          </button>
        </div>
      </aside>

      <main class="ownership-assets">
        <div class="panel-heading">
          <div>
            <div class="panel-heading__title">{{ selectedGroup?.label || '资产明细' }}</div>
            <div class="panel-heading__sub">
              {{ selectedGroup ? `${selectedGroup.total} 台当前领用资产` : '选择左侧分组查看资产' }}
            </div>
          </div>
          <el-button v-if="selectedAsset" plain @click="openLedger(selectedAsset)">打开台账</el-button>
        </div>

        <el-table
          :data="selectedAssets"
          :height="tableHeight"
          stripe
          highlight-current-row
          class="ownership-table"
          :row-class-name="assetRowClassName"
          @row-click="selectAsset"
        >
          <el-table-column label="类型" width="92">
            <template #default="{ row }">
              <el-tag size="small" :type="row.kind === 'pc' ? 'primary' : 'success'" effect="plain">
                {{ row.kind === 'pc' ? '电脑' : '显示器' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="资产" min-width="190" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="asset-main">{{ assetTitle(row) }}</div>
              <div class="asset-sub">{{ assetSubTitle(row) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <span class="status-chip" :class="assetStatusClass(row.status || '')">{{ assetStatusText(row.status || '') }}</span>
            </template>
          </el-table-column>
          <el-table-column label="领用时间" prop="assigned_at" width="170" show-overflow-tooltip />
          <el-table-column label="位置" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ locationText(row) }}</template>
          </el-table-column>
        </el-table>
      </main>

      <aside class="ownership-timeline">
        <div class="panel-heading">
          <div>
            <div class="panel-heading__title">生命周期时间线</div>
            <div class="panel-heading__sub">{{ selectedAsset ? assetTitle(selectedAsset) : '选择资产后显示' }}</div>
          </div>
          <el-button v-if="selectedAsset" circle plain :loading="timelineLoading" title="刷新时间线" @click="loadLifecycle(selectedAsset)">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </div>

        <el-empty v-if="!selectedAsset" description="请选择一台资产" />
        <el-skeleton v-else-if="timelineLoading && !timeline.events.length" animated :rows="8" />
        <el-timeline v-else class="asset-timeline">
          <el-timeline-item
            v-for="event in timeline.events"
            :key="event.id"
            :timestamp="event.occurred_at || '-'"
            placement="top"
            :type="timelineItemType(event)"
          >
            <div class="timeline-event">
              <div class="timeline-event__title">{{ event.title }}</div>
              <div class="timeline-event__meta">
                <el-tag size="small" effect="plain">{{ categoryText(event.category) }}</el-tag>
                <span v-if="event.reference_no">{{ event.reference_no }}</span>
                <span v-if="event.created_by">操作人：{{ event.created_by }}</span>
              </div>
              <div v-if="eventDetail(event)" class="timeline-event__detail">{{ eventDetail(event) }}</div>
              <div v-if="event.remark" class="timeline-event__remark">{{ event.remark }}</div>
            </div>
          </el-timeline-item>
        </el-timeline>
      </aside>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeMount, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import { ElSegmented } from 'element-plus/es/components/segmented/index';
import { getAssetLifecycle, getAssetOwnershipOverview, type AssetLifecycleEvent, type AssetLifecyclePayload, type AssetOwnershipAsset, type AssetOwnershipGroup, type AssetOwnershipGroupBy, type AssetOwnershipKind, type AssetOwnershipOverview } from '../api/assetOwnership';
import { assetStatusText } from '../types/assets';
import { assetStatusClass } from '../composables/useAssetTableShared';
import { ElMessage } from '../utils/el-services';

const router = useRouter();
const groupBy = ref<AssetOwnershipGroupBy>('person');
const kind = ref<AssetOwnershipKind>('all');
const keywordInput = ref('');
const keyword = ref('');
const loading = ref(false);
const timelineLoading = ref(false);
const selectedGroupKey = ref('');
const selectedAssetKey = ref('');
const tableHeight = ref(520);
let overviewController: AbortController | null = null;
let lifecycleController: AbortController | null = null;

const emptyOverview: AssetOwnershipOverview = {
  group_by: 'person',
  kind: 'all',
  keyword: '',
  groups: [],
  assets: [],
  summary: { groups: 0, total: 0, pc: 0, monitor: 0 },
};
const overview = ref<AssetOwnershipOverview>({ ...emptyOverview });
const timeline = ref<AssetLifecyclePayload>({ asset: null, events: [] });

const groupModeOptions = [
  { label: '按人员', value: 'person' },
  { label: '按部门', value: 'department' },
];

const kindOptions = [
  { label: '全部', value: 'all' },
  { label: '电脑', value: 'pc' },
  { label: '显示器', value: 'monitor' },
];

const filteredGroups = computed(() => overview.value.groups || []);
const selectedGroup = computed<AssetOwnershipGroup | null>(() => filteredGroups.value.find((item) => item.key === selectedGroupKey.value) || filteredGroups.value[0] || null);
const selectedAssets = computed(() => selectedGroup.value?.assets || []);
const selectedAsset = computed<AssetOwnershipAsset | null>(() => {
  if (!selectedAssets.value.length) return null;
  return selectedAssets.value.find((item) => assetKey(item) === selectedAssetKey.value) || selectedAssets.value[0] || null;
});

function assetKey(row: AssetOwnershipAsset) {
  return `${row.kind}:${row.id}`;
}

function assetTitle(row: AssetOwnershipAsset) {
  return row.kind === 'pc'
    ? `${row.brand || '-'} ${row.model || ''}`.trim()
    : `${row.asset_code || '-'} · ${[row.brand, row.model].filter(Boolean).join(' ') || '-'}`;
}

function assetSubTitle(row: AssetOwnershipAsset) {
  if (row.kind === 'pc') return `SN: ${row.serial_no || row.asset_code || '-'}`;
  return `SN: ${row.serial_no || '-'} · ${row.department || '未填写部门'}`;
}

function locationText(row: AssetOwnershipAsset) {
  const text = [row.parent_location_name, row.location_name].filter(Boolean).join('/');
  return text || '-';
}

function assetRowClassName({ row }: { row: AssetOwnershipAsset }) {
  return selectedAssetKey.value === assetKey(row) ? 'ownership-table-row--active' : '';
}

function categoryText(category: AssetLifecycleEvent['category']) {
  if (category === 'movement') return '流转';
  if (category === 'inventory') return '盘点';
  if (category === 'archive') return '归档';
  return '台账';
}

function timelineItemType(event: AssetLifecycleEvent) {
  if (event.category === 'archive') return 'warning';
  if (event.category === 'inventory') return event.action === 'OK' ? 'success' : 'danger';
  if (event.action === 'CURRENT') return 'primary';
  return 'info';
}

function eventDetail(event: AssetLifecycleEvent) {
  const parts: string[] = [];
  const owner = [event.employee_name, event.employee_no].filter(Boolean).join(' / ');
  if (owner) parts.push(`领用人：${owner}`);
  if (event.department) parts.push(`部门：${event.department}`);
  if (event.location_name) parts.push(`位置：${event.location_name}`);
  if (event.from_location_name || event.to_location_name) {
    parts.push(`位置：${event.from_location_name || '-'} -> ${event.to_location_name || '-'}`);
  }
  if (event.status) parts.push(`状态：${assetStatusText(event.status)}`);
  if (event.issue_type) parts.push(`异常：${event.issue_type}`);
  return parts.join(' · ');
}

function selectGroup(key: string) {
  selectedGroupKey.value = key;
  selectedAssetKey.value = selectedAssets.value[0] ? assetKey(selectedAssets.value[0]) : '';
}

function selectAsset(row: AssetOwnershipAsset) {
  selectedAssetKey.value = assetKey(row);
}

function applySearch() {
  keyword.value = keywordInput.value.trim();
  void reload();
}

async function reload() {
  overviewController?.abort();
  const controller = new AbortController();
  overviewController = controller;
  loading.value = true;
  try {
    const next = await getAssetOwnershipOverview({
      groupBy: groupBy.value,
      kind: kind.value,
      keyword: keyword.value,
      limit: 500,
    }, controller.signal);
    overview.value = next;
    selectedGroupKey.value = next.groups[0]?.key || '';
    selectedAssetKey.value = next.groups[0]?.assets?.[0] ? assetKey(next.groups[0].assets[0]) : '';
  } catch (error: any) {
    if (error?.name !== 'AbortError') ElMessage.error(error?.message || '加载资产归属视图失败');
  } finally {
    if (overviewController === controller) overviewController = null;
    loading.value = false;
  }
}

async function loadLifecycle(asset: AssetOwnershipAsset | null) {
  if (!asset) {
    timeline.value = { asset: null, events: [] };
    return;
  }
  lifecycleController?.abort();
  const controller = new AbortController();
  lifecycleController = controller;
  timelineLoading.value = true;
  try {
    timeline.value = await getAssetLifecycle(asset.kind, asset.id, controller.signal);
  } catch (error: any) {
    if (error?.name !== 'AbortError') ElMessage.error(error?.message || '加载资产生命周期失败');
  } finally {
    if (lifecycleController === controller) lifecycleController = null;
    timelineLoading.value = false;
  }
}

function openLedger(asset: AssetOwnershipAsset) {
  router.push(asset.kind === 'pc' ? '/pc/assets' : '/pc/monitors');
}

function updateTableHeight() {
  if (typeof window === 'undefined') return;
  tableHeight.value = Math.max(360, Math.min(680, window.innerHeight - 350));
}

watch([groupBy, kind], () => {
  void reload();
});

watch(selectedAsset, (asset, previous) => {
  if (asset && previous && assetKey(asset) === assetKey(previous)) return;
  void loadLifecycle(asset);
});

onBeforeMount(() => {
  updateTableHeight();
  if (typeof window !== 'undefined') window.addEventListener('resize', updateTableHeight, { passive: true });
  void reload();
});

onBeforeUnmount(() => {
  overviewController?.abort();
  lifecycleController?.abort();
  if (typeof window !== 'undefined') window.removeEventListener('resize', updateTableHeight);
});
</script>

<style scoped>
.ownership-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ownership-heading__meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.ownership-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid #d8dee9;
  border-radius: 8px;
  background: #fff;
}

.ownership-toolbar__search {
  min-width: 280px;
  flex: 1;
}

.ownership-workspace {
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(420px, 1fr) minmax(320px, 420px);
  gap: 12px;
  align-items: stretch;
}

.ownership-groups,
.ownership-assets,
.ownership-timeline {
  min-width: 0;
  border: 1px solid #d8dee9;
  border-radius: 8px;
  background: #fff;
  padding: 14px;
  overflow: hidden;
}

.panel-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.panel-heading__title {
  font-size: 16px;
  font-weight: 700;
  color: #1f2937;
}

.panel-heading__sub {
  margin-top: 3px;
  font-size: 12px;
  color: #6b7280;
}

.group-list {
  display: grid;
  gap: 8px;
  max-height: 640px;
  overflow: auto;
  padding-right: 2px;
}

.group-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.group-row:hover,
.group-row--active {
  border-color: #409eff;
  background: #f0f7ff;
}

.group-row__main {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.group-row__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 650;
}

.group-row__sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #6b7280;
  font-size: 12px;
}

.group-row__counts {
  display: grid;
  justify-items: end;
  gap: 2px;
  flex: 0 0 auto;
}

.group-row__counts b {
  font-size: 18px;
  line-height: 1;
  color: #1f2937;
}

.group-row__counts small {
  color: #6b7280;
}

.asset-main {
  font-weight: 650;
  color: #1f2937;
}

.asset-sub {
  margin-top: 2px;
  font-size: 12px;
  color: #6b7280;
}

.ownership-table :deep(.ownership-table-row--active > td) {
  background: #f0f7ff !important;
}

.asset-timeline {
  max-height: 640px;
  overflow: auto;
  padding-right: 4px;
}

.timeline-event {
  display: grid;
  gap: 6px;
}

.timeline-event__title {
  font-weight: 700;
  color: #1f2937;
}

.timeline-event__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: #6b7280;
  font-size: 12px;
}

.timeline-event__detail {
  color: #374151;
  font-size: 13px;
  line-height: 1.5;
}

.timeline-event__remark {
  color: #6b7280;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}

@media (max-width: 1280px) {
  .ownership-workspace {
    grid-template-columns: 280px minmax(0, 1fr);
  }

  .ownership-timeline {
    grid-column: 1 / -1;
  }
}

@media (max-width: 768px) {
  .ownership-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .ownership-toolbar__segment,
  .ownership-toolbar__search {
    width: 100%;
    min-width: 0;
  }

  .ownership-workspace {
    grid-template-columns: 1fr;
  }

  .group-list,
  .asset-timeline {
    max-height: none;
  }
}
</style>
