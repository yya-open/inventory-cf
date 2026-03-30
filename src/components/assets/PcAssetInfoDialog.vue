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
        <div class="ledger-drawer__eyebrow">PC ASSET</div>
        <div class="ledger-drawer__title">电脑详情</div>
        <div class="ledger-drawer__desc">把设备基础信息、配置、领用与操作节点统一放进同一个详情抽屉，保持台账查看上下文连续。</div>
      </div>
    </template>

    <div class="ledger-drawer__body">
      <section class="ledger-detail-hero">
        <div>
          <div class="ledger-detail-hero__title">{{ assetTitle }}</div>
          <div class="ledger-detail-hero__meta">序列号：{{ textOrDash(row?.serial_no) }} · 资产 ID：{{ textOrDash(row?.id) }}</div>
        </div>
        <span class="ledger-status-chip" :class="statusChipClass(row?.status)">{{ statusText(row?.status) }}</span>
      </section>

      <section class="ledger-detail-grid">
        <article class="ledger-detail-card">
          <div class="ledger-detail-card__title">基础信息</div>
          <dl class="ledger-detail-list">
            <div><dt>品牌</dt><dd>{{ textOrDash(row?.brand) }}</dd></div>
            <div><dt>型号</dt><dd>{{ textOrDash(row?.model) }}</dd></div>
            <div><dt>出厂日期</dt><dd>{{ textOrDash(row?.manufacture_date) }}</dd></div>
            <div><dt>保修到期</dt><dd>{{ textOrDash(row?.warranty_end) }}</dd></div>
            <div><dt>创建时间</dt><dd>{{ textOrDash(row?.created_at) }}</dd></div>
            <div><dt>最近更新</dt><dd>{{ textOrDash(row?.updated_at) }}</dd></div>
          </dl>
        </article>

        <article class="ledger-detail-card">
          <div class="ledger-detail-card__title">配置与领用</div>
          <dl class="ledger-detail-list">
            <div><dt>硬盘容量</dt><dd>{{ textOrDash(row?.disk_capacity) }}</dd></div>
            <div><dt>内存大小</dt><dd>{{ textOrDash(row?.memory_size) }}</dd></div>
            <div><dt>当前领用人</dt><dd>{{ currentOwnerName }}</dd></div>
            <div><dt>工号 / 部门</dt><dd>{{ currentOwnerMeta }}</dd></div>
            <div><dt>配置日期</dt><dd>{{ textOrDash(row?.last_config_date) }}</dd></div>
            <div><dt>回收日期</dt><dd>{{ textOrDash(row?.last_recycle_date) }}</dd></div>
          </dl>
        </article>
      </section>

      <section v-if="Number(row?.archived || 0) === 1" class="ledger-detail-card ledger-detail-card--full">
        <div class="ledger-detail-card__title">归档记录</div>
        <dl class="ledger-detail-list">
          <div><dt>归档原因</dt><dd>{{ textOrDash(row?.archived_reason, '未填写') }}</dd></div>
          <div><dt>归档人</dt><dd>{{ textOrDash(row?.archived_by) }}</dd></div>
          <div><dt>归档时间</dt><dd>{{ textOrDash(row?.archived_at) }}</dd></div>
          <div><dt>备注</dt><dd>{{ textOrDash(row?.archived_note) }}</dd></div>
        </dl>
      </section>

      <section class="ledger-detail-card ledger-detail-card--full">
        <div class="ledger-detail-card__title">备注</div>
        <div class="ledger-detail-card__content">{{ textOrDash(row?.remark, '暂无备注') }}</div>
      </section>

      <AssetAuditSummaryPanel entity="pc_assets" :entity-id="row?.id" module="PC" :visible="visible" />
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
import AssetAuditSummaryPanel from './AssetAuditSummaryPanel.vue';

const props = defineProps<{ visible: boolean; row: Record<string, any> | null }>();

const emit = defineEmits<{
  'update:visible': [boolean];
  'view-audit': [];
}>();

const assetTitle = computed(() => [props.row?.brand, props.row?.model].filter(Boolean).join(' · ') || '未命名电脑');
const currentOwnerName = computed(() => props.row?.status === 'ASSIGNED' ? textOrDash(props.row?.last_employee_name) : '-');
const currentOwnerMeta = computed(() => {
  if (props.row?.status !== 'ASSIGNED') return '-';
  const parts = [props.row?.last_employee_no, props.row?.last_department].map((item) => String(item || '').trim()).filter(Boolean);
  return parts.length ? parts.join(' · ') : '-';
});

function textOrDash(value: unknown, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function statusText(status: string | undefined) {
  if (status === 'IN_STOCK') return '在库';
  if (status === 'ASSIGNED') return '已领用';
  if (status === 'RECYCLED') return '已回收';
  if (status === 'SCRAPPED') return '已报废';
  return '未知状态';
}

function statusChipClass(status: string | undefined) {
  if (status === 'IN_STOCK') return 'is-success';
  if (status === 'ASSIGNED') return 'is-warning';
  if (status === 'RECYCLED') return 'is-info';
  return 'is-danger';
}
</script>
