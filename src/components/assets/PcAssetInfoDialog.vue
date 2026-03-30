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
        <div class="ledger-drawer__desc">把设备基础信息、配置、领用与归档记录放进同一个详情抽屉，方便在列表中连续查看。</div>
      </div>
    </template>

    <div class="ledger-drawer__body">
      <section class="ledger-detail-hero">
        <div>
          <div class="ledger-detail-hero__title">{{ [row?.brand, row?.model].filter(Boolean).join(' · ') || '未命名电脑' }}</div>
          <div class="ledger-detail-hero__meta">序列号：{{ row?.serial_no || '-' }}</div>
        </div>
        <span class="ledger-status-chip" :class="statusChipClass(row?.status)">{{ statusText(row?.status) }}</span>
      </section>

      <section class="ledger-detail-grid">
        <article class="ledger-detail-card">
          <div class="ledger-detail-card__title">基础信息</div>
          <dl class="ledger-detail-list">
            <div><dt>品牌</dt><dd>{{ row?.brand || '-' }}</dd></div>
            <div><dt>型号</dt><dd>{{ row?.model || '-' }}</dd></div>
            <div><dt>出厂日期</dt><dd>{{ row?.manufacture_date || '-' }}</dd></div>
            <div><dt>保修到期</dt><dd>{{ row?.warranty_end || '-' }}</dd></div>
            <div><dt>配置日期</dt><dd>{{ row?.last_config_date || '-' }}</dd></div>
            <div><dt>回收日期</dt><dd>{{ row?.last_recycle_date || '-' }}</dd></div>
          </dl>
        </article>

        <article class="ledger-detail-card">
          <div class="ledger-detail-card__title">配置与领用</div>
          <dl class="ledger-detail-list">
            <div><dt>硬盘容量</dt><dd>{{ row?.disk_capacity || '-' }}</dd></div>
            <div><dt>内存大小</dt><dd>{{ row?.memory_size || '-' }}</dd></div>
            <div><dt>当前领用人</dt><dd>{{ row?.status === 'ASSIGNED' ? (row?.last_employee_name || '-') : '-' }}</dd></div>
            <div><dt>工号 / 部门</dt><dd>{{ row?.status === 'ASSIGNED' ? [row?.last_employee_no || '-', row?.last_department || '-'].join(' · ') : '-' }}</dd></div>
          </dl>
        </article>
      </section>

      <section v-if="Number(row?.archived || 0) === 1" class="ledger-detail-card ledger-detail-card--full">
        <div class="ledger-detail-card__title">归档记录</div>
        <dl class="ledger-detail-list">
          <div><dt>归档原因</dt><dd>{{ row?.archived_reason || '未填写' }}</dd></div>
          <div><dt>归档人</dt><dd>{{ row?.archived_by || '-' }}</dd></div>
          <div><dt>归档时间</dt><dd>{{ row?.archived_at || '-' }}</dd></div>
          <div><dt>备注</dt><dd>{{ row?.archived_note || '-' }}</dd></div>
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
defineProps<{ visible: boolean; row: Record<string, any> | null }>();

const emit = defineEmits<{
  'update:visible': [boolean];
  'view-audit': [];
}>();

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
