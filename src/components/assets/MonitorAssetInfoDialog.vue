<template>
  <el-drawer
    :model-value="visible"
    class="ledger-drawer"
    size="720px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <template #header>
      <div class="ledger-drawer__intro">
        <div class="ledger-drawer__eyebrow">MONITOR ASSET</div>
        <div class="ledger-drawer__title">显示器详情</div>
        <div class="ledger-drawer__desc">把设备基础资料、位置、领用与关键操作节点统一放进详情抽屉，保证查看和追溯保持同一上下文。</div>
      </div>
    </template>

    <div class="ledger-drawer__body">
      <section class="ledger-detail-hero">
        <div>
          <div class="ledger-detail-hero__title">{{ textOrDash(row?.asset_code, '未命名显示器') }}</div>
          <div class="ledger-detail-hero__meta">{{ [textOrDash(row?.brand), textOrDash(row?.model), row?.id ? `ID ${row.id}` : null].filter(Boolean).join(' · ') }}</div>
        </div>
        <span class="ledger-status-chip" :class="statusChipClass(row?.status || '')">{{ statusText(row?.status || '') }}</span>
      </section>

      <section class="ledger-detail-grid">
        <article class="ledger-detail-card">
          <div class="ledger-detail-card__title">基础信息</div>
          <dl class="ledger-detail-list">
            <div><dt>资产编号</dt><dd>{{ textOrDash(row?.asset_code) }}</dd></div>
            <div><dt>SN</dt><dd>{{ textOrDash(row?.sn) }}</dd></div>
            <div><dt>品牌</dt><dd>{{ textOrDash(row?.brand) }}</dd></div>
            <div><dt>型号</dt><dd>{{ textOrDash(row?.model) }}</dd></div>
            <div><dt>尺寸</dt><dd>{{ textOrDash(row?.size_inch) }}</dd></div>
            <div><dt>创建时间</dt><dd>{{ textOrDash(row?.created_at) }}</dd></div>
          </dl>
        </article>

        <article class="ledger-detail-card">
          <div class="ledger-detail-card__title">位置与领用</div>
          <dl class="ledger-detail-list">
            <div><dt>当前位置</dt><dd>{{ locationText(row) }}</dd></div>
            <div><dt>领用人</dt><dd>{{ currentOwnerName }}</dd></div>
            <div><dt>工号 / 部门</dt><dd>{{ currentOwnerMeta }}</dd></div>
            <div><dt>最近更新</dt><dd>{{ textOrDash(row?.updated_at) }}</dd></div>
            <div><dt>二维码更新</dt><dd>{{ textOrDash(row?.qr_updated_at) }}</dd></div>
            <div><dt>资产状态</dt><dd>{{ statusText(row?.status || '') }}</dd></div>
          </dl>
        </article>
      </section>

      <section v-if="Number(row?.archived || 0) === 1" class="ledger-detail-card ledger-detail-card--full">
        <div class="ledger-detail-card__title">归档记录</div>
        <dl class="ledger-detail-list">
          <div><dt>归档原因</dt><dd>{{ textOrDash(row?.archived_reason, '未填写') }}</dd></div>
          <div><dt>归档人</dt><dd>{{ textOrDash(row?.archived_by) }}</dd></div>
          <div><dt>归档时间</dt><dd>{{ textOrDash(row?.archived_at) }}</dd></div>
          <div><dt>归档备注</dt><dd>{{ textOrDash(row?.archived_note) }}</dd></div>
        </dl>
      </section>

      <section class="ledger-detail-card ledger-detail-card--full">
        <div class="ledger-detail-card__title">上一位历史领用人</div>
        <div class="ledger-detail-card__hint">仅展示该显示器资产上一条历史领用信息，方便回看最近一次交接轨迹。</div>
        <dl class="ledger-detail-list">
          <div><dt>姓名</dt><dd>{{ previousOwnerName }}</dd></div>
          <div><dt>工号 / 部门</dt><dd>{{ previousOwnerMeta }}</dd></div>
          <div><dt>最近领用时间</dt><dd>{{ previousOwnerAt }}</dd></div>
        </dl>
      </section>
    </div>

    <template #footer>
      <div class="ledger-drawer__footer">
        <el-button type="primary" plain @click="emit('view-audit')">查看审计历史</el-button>
        <el-button @click="emit('update:visible', false)">关闭</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { getMonitorAssetHistory } from '../../api/assetHistory';

const props = defineProps<{
  visible: boolean;
  row: Record<string, any> | null;
  locationText: (row: any) => string;
  statusText: (status: string) => string;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  'view-audit': [];
}>();

const currentOwnerName = computed(() => props.row?.status === 'ASSIGNED' ? textOrDash(props.row?.employee_name) : '-');
const currentOwnerMeta = computed(() => {
  if (props.row?.status !== 'ASSIGNED') return '-';
  const parts = [props.row?.employee_no, props.row?.department].map((item) => String(item || '').trim()).filter(Boolean);
  return parts.length ? parts.join(' · ') : '-';
});
const historyState = reactive<{ loading: boolean; loadedId: number; previous_employee_no?: string | null; previous_employee_name?: string | null; previous_department?: string | null; previous_assigned_at?: string | null }>({
  loading: false,
  loadedId: 0,
  previous_employee_no: null,
  previous_employee_name: null,
  previous_department: null,
  previous_assigned_at: null,
});

async function loadHistoryIfNeeded() {
  const assetId = Number(props.row?.id || 0);
  if (!props.visible || !assetId || historyState.loadedId === assetId || historyState.loading) return;
  historyState.loading = true;
  try {
    const payload = await getMonitorAssetHistory(assetId);
    historyState.loadedId = assetId;
    historyState.previous_employee_no = payload?.previous_employee_no || null;
    historyState.previous_employee_name = payload?.previous_employee_name || null;
    historyState.previous_department = payload?.previous_department || null;
    historyState.previous_assigned_at = payload?.previous_assigned_at || null;
  } finally {
    historyState.loading = false;
  }
}

watch(() => [props.visible, props.row?.id], () => { void loadHistoryIfNeeded(); }, { immediate: true });

const previousOwnerName = computed(() => historyState.loading && !historyState.loadedId ? '正在加载…' : textOrDash(historyState.previous_employee_name, '暂无历史领用人'));
const previousOwnerMeta = computed(() => {
  if (historyState.loading && !historyState.loadedId) return '正在加载…';
  const parts = [historyState.previous_employee_no, historyState.previous_department].map((item) => String(item || '').trim()).filter(Boolean);
  return parts.length ? parts.join(' · ') : '-';
});
const previousOwnerAt = computed(() => historyState.loading && !historyState.loadedId ? '正在加载…' : textOrDash(historyState.previous_assigned_at, '暂无记录'));

function textOrDash(value: unknown, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function statusChipClass(status: string) {
  if (status === 'IN_STOCK') return 'is-success';
  if (status === 'ASSIGNED') return 'is-warning';
  if (status === 'RECYCLED') return 'is-info';
  return 'is-danger';
}
</script>
