<template>
  <div class="ledger-table-skeleton" aria-hidden="true">
    <div class="ledger-table-skeleton__head" />
    <div v-for="index in normalizedRowCount" :key="index" class="ledger-table-skeleton__row">
      <span class="ledger-table-skeleton__cell ledger-table-skeleton__cell--short" />
      <span class="ledger-table-skeleton__cell ledger-table-skeleton__cell--wide" />
      <span class="ledger-table-skeleton__cell" />
      <span class="ledger-table-skeleton__cell" />
      <span class="ledger-table-skeleton__cell ledger-table-skeleton__cell--mid" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  rowCount?: number;
}>(), {
  rowCount: 8,
});

const normalizedRowCount = computed(() => Math.min(12, Math.max(4, Number(props.rowCount || 8) || 8)));
</script>
