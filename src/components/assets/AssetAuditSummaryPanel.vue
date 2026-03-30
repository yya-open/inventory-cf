<template>
  <section class="ledger-detail-card ledger-detail-card--full">
    <div class="ledger-detail-card__title">审批 / 操作日志</div>
    <div class="ledger-detail-card__hint">抽屉内直接展示最近几条关键变更，完整记录可继续进入审计历史查看。</div>

    <div v-if="loading" class="ledger-audit-list">
      <div v-for="item in 3" :key="item" class="ledger-audit-event is-loading">
        <div class="ledger-audit-event__main">
          <div class="ledger-audit-event__summary">正在加载审计摘要…</div>
          <div class="ledger-audit-event__meta">请稍候</div>
        </div>
        <span class="ledger-audit-event__pill">同步中</span>
      </div>
    </div>

    <div v-else-if="events.length" class="ledger-audit-list">
      <div v-for="item in events" :key="item.id" class="ledger-audit-event">
        <div class="ledger-audit-event__main">
          <div class="ledger-audit-event__summary">{{ item.summary }}</div>
          <div class="ledger-audit-event__meta">{{ item.operator }} · {{ item.time }}</div>
        </div>
        <span class="ledger-audit-event__pill" :class="{ 'is-danger': item.highRisk }">{{ item.actionLabel }}</span>
      </div>
    </div>

    <el-empty
      v-else-if="permissionDenied"
      :image-size="72"
      description="当前账号暂无审计摘要查看权限"
    />

    <el-empty
      v-else-if="errorMessage"
      :image-size="72"
      :description="errorMessage"
    />

    <el-empty
      v-else
      :image-size="72"
      description="暂未查询到关键变更记录"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { apiGet } from '../../api/client';
import { formatBeijingDateTime } from '../../utils/datetime';

const props = defineProps<{
  entity: string;
  entityId: string | number | null | undefined;
  module?: string;
  visible?: boolean;
}>();

type AuditSummaryEvent = {
  id: number;
  summary: string;
  operator: string;
  time: string;
  highRisk: boolean;
  actionLabel: string;
};

const events = ref<AuditSummaryEvent[]>([]);
const loading = ref(false);
const permissionDenied = ref(false);
const errorMessage = ref('');

const entityIdText = computed(() => {
  const raw = String(props.entityId ?? '').trim();
  return raw || '';
});

watch(
  () => [props.visible, props.entity, entityIdText.value, props.module] as const,
  ([visible, entity, entityId]) => {
    if (!visible || !entity || !entityId) {
      events.value = [];
      loading.value = false;
      permissionDenied.value = false;
      errorMessage.value = '';
      return;
    }
    void loadAuditSummary();
  },
  { immediate: true },
);

async function loadAuditSummary() {
  if (!props.entity || !entityIdText.value) return;
  loading.value = true;
  permissionDenied.value = false;
  errorMessage.value = '';
  try {
    const params = new URLSearchParams();
    params.set('entity', props.entity);
    params.set('entity_id', entityIdText.value);
    if (props.module) params.set('module', props.module);
    params.set('page', '1');
    params.set('page_size', '5');
    params.set('sort_by', 'created_at');
    params.set('sort_dir', 'desc');
    const response: any = await apiGet(`/api/audit/list?${params.toString()}`);
    const rows = Array.isArray(response?.data) ? response.data : [];
    events.value = rows.slice(0, 5).map((row: any) => ({
      id: Number(row?.id || 0),
      summary: resolveSummary(row),
      operator: String(row?.username || '系统').trim() || '系统',
      time: formatBeijingDateTime(row?.created_at) || textOrDash(row?.created_at),
      highRisk: Number(row?.high_risk || 0) === 1,
      actionLabel: resolveActionLabel(row),
    }));
  } catch (error: any) {
    events.value = [];
    if (Number(error?.status || 0) === 401 || Number(error?.status || 0) === 403) {
      permissionDenied.value = true;
      return;
    }
    errorMessage.value = error?.message || '审计摘要加载失败';
  } finally {
    loading.value = false;
  }
}

function resolveSummary(row: any) {
  const summary = textOrDash(row?.summary_text, '');
  if (summary) return summary;
  const target = [textOrDash(row?.target_name, ''), textOrDash(row?.target_code, '')].filter(Boolean).join(' · ');
  const base = resolveActionLabel(row);
  return target ? `${base}：${target}` : base;
}

function resolveActionLabel(row: any) {
  const action = String(row?.action || '').trim();
  return ACTION_LABEL[action] || prettifyCode(action) || '操作变更';
}

function prettifyCode(value: string) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => ACTION_TOKEN_LABEL[segment.toUpperCase()] || segment)
    .join('');
}

function textOrDash(value: unknown, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

const ACTION_LABEL: Record<string, string> = {
  PC_IN: '电脑入库',
  PC_OUT: '电脑出库',
  PC_RETURN: '电脑归还',
  PC_RECYCLE: '电脑回收',
  PC_SCRAP: '电脑报废',
  PC_ASSET_UPDATE: '修改电脑台账',
  PC_ASSET_DELETE: '删除电脑台账',
  PC_ASSET_PURGE: '彻底删除电脑台账',
  PC_ASSET_ARCHIVE: '归档电脑台账',
  PC_ASSET_ARCHIVE_BATCH: '批量归档电脑台账',
  PC_ASSET_RESTORE_BATCH: '批量恢复电脑归档',
  PC_ASSET_STATUS_BATCH: '批量修改电脑状态',
  PC_ASSET_OWNER_BATCH: '批量修改电脑领用人',
  MONITOR_ASSET_CREATE: '新增显示器台账',
  MONITOR_ASSET_UPDATE: '修改显示器台账',
  MONITOR_ASSET_DELETE: '删除显示器台账',
  MONITOR_ASSET_PURGE: '彻底删除显示器台账',
  MONITOR_ASSET_ARCHIVE: '归档显示器台账',
  MONITOR_ASSET_ARCHIVE_BATCH: '批量归档显示器台账',
  MONITOR_ASSET_RESTORE_BATCH: '批量恢复显示器归档',
  MONITOR_ASSET_STATUS_BATCH: '批量修改显示器状态',
  MONITOR_ASSET_LOCATION_BATCH: '批量修改显示器位置',
  MONITOR_ASSET_OWNER_BATCH: '批量修改显示器领用人',
  MONITOR_IN: '显示器入库',
  MONITOR_OUT: '显示器出库',
  MONITOR_RETURN: '显示器归还',
  MONITOR_TRANSFER: '显示器调拨',
  MONITOR_SCRAP: '显示器报废',
};

const ACTION_TOKEN_LABEL: Record<string, string> = {
  PC: '电脑',
  MONITOR: '显示器',
  ASSET: '台账',
  ASSETS: '台账',
  STATUS: '状态',
  OWNER: '领用人',
  LOCATION: '位置',
  BATCH: '批量',
  CREATE: '新增',
  UPDATE: '修改',
  DELETE: '删除',
  PURGE: '彻底删除',
  ARCHIVE: '归档',
  RESTORE: '恢复',
  IN: '入库',
  OUT: '出库',
  RETURN: '归还',
  RECYCLE: '回收',
  TRANSFER: '调拨',
  SCRAP: '报废',
};
</script>
