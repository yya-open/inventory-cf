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
        <div class="ledger-drawer__desc">查看设备基础资料、位置、领用和归档记录时保持在同一页面上下文，不打断台账浏览。</div>
      </div>
    </template>

    <div class="ledger-drawer__body">
      <section class="ledger-detail-hero">
        <div>
          <div class="ledger-detail-hero__title">{{ row?.asset_code || '未命名显示器' }}</div>
          <div class="ledger-detail-hero__meta">{{ [row?.brand || '-', row?.model || '-'].join(' · ') }}</div>
        </div>
        <span class="ledger-status-chip" :class="statusChipClass(row?.status)">{{ statusText(row?.status || '') }}</span>
      </section>

      <section class="ledger-detail-grid">
        <article class="ledger-detail-card">
          <div class="ledger-detail-card__title">基础信息</div>
          <dl class="ledger-detail-list">
            <div><dt>资产编号</dt><dd>{{ row?.asset_code || '-' }}</dd></div>
            <div><dt>SN</dt><dd>{{ row?.sn || '-' }}</dd></div>
            <div><dt>品牌</dt><dd>{{ row?.brand || '-' }}</dd></div>
            <div><dt>型号</dt><dd>{{ row?.model || '-' }}</dd></div>
            <div><dt>尺寸</dt><dd>{{ row?.size_inch || '-' }}</dd></div>
            <div><dt>更新时间</dt><dd>{{ row?.updated_at || '-' }}</dd></div>
          </dl>
        </article>

        <article class="ledger-detail-card">
          <div class="ledger-detail-card__title">位置与领用</div>
          <dl class="ledger-detail-list">
            <div><dt>当前位置</dt><dd>{{ locationText(row) }}</dd></div>
            <div><dt>领用人</dt><dd>{{ row?.status === 'ASSIGNED' ? (row?.employee_name || '-') : '-' }}</dd></div>
            <div><dt>工号 / 部门</dt><dd>{{ row?.status === 'ASSIGNED' ? [row?.employee_no || '-', row?.department || '-'].join(' · ') : '-' }}</dd></div>
            <div><dt>设备 ID</dt><dd>{{ row?.id || '-' }}</dd></div>
          </dl>
        </article>
      </section>

      <section v-if="Number(row?.archived || 0) === 1" class="ledger-detail-card ledger-detail-card--full">
        <div class="ledger-detail-card__title">归档记录</div>
        <dl class="ledger-detail-list">
          <div><dt>归档原因</dt><dd>{{ row?.archived_reason || '未填写' }}</dd></div>
          <div><dt>归档人</dt><dd>{{ row?.archived_by || '-' }}</dd></div>
          <div><dt>归档时间</dt><dd>{{ row?.archived_at || '-' }}</dd></div>
          <div><dt>归档备注</dt><dd>{{ row?.archived_note || '-' }}</dd></div>
        </dl>
      </section>

      <section class="ledger-detail-card ledger-detail-card--full">
        <div class="ledger-detail-card__title">备注</div>
        <div class="ledger-detail-card__content">{{ row?.remark || '暂无备注' }}</div>
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
defineProps<{
  visible: boolean;
  row: Record<string, any> | null;
  locationText: (row: any) => string;
  statusText: (status: string) => string;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  'view-audit': [];
}>();

function statusChipClass(status: string) {
  if (status === 'IN_STOCK') return 'is-success';
  if (status === 'ASSIGNED') return 'is-warning';
  if (status === 'RECYCLED') return 'is-info';
  return 'is-danger';
}
</script>
