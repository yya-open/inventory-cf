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
        <div class="ledger-detail-card__title">备注</div>
        <div class="ledger-detail-card__content">{{ textOrDash(row?.remark, '暂无备注') }}</div>
      </section>

      <section class="ledger-detail-card ledger-detail-card--full">
        <div class="ledger-detail-card__title">审批 / 操作日志</div>
        <div class="ledger-detail-card__hint">当前页先展示关键操作节点，完整变更记录可点击底部入口查看审计历史。</div>
        <div class="ledger-log-list">
          <div v-for="item in logItems" :key="item.label" class="ledger-log-item">
            <span class="ledger-log-item__label">{{ item.label }}</span>
            <strong class="ledger-log-item__value">{{ item.value }}</strong>
          </div>
        </div>
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
import { computed } from 'vue';

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
const logItems = computed(() => [
  { label: '创建时间', value: textOrDash(props.row?.created_at) },
  { label: '最近更新', value: textOrDash(props.row?.updated_at) },
  { label: '二维码更新', value: textOrDash(props.row?.qr_updated_at) },
  { label: '当前位置', value: props.locationText(props.row) },
  { label: '当前状态', value: props.statusText(props.row?.status || '') },
  { label: '归档时间', value: Number(props.row?.archived || 0) === 1 ? textOrDash(props.row?.archived_at) : '-' },
]);

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
