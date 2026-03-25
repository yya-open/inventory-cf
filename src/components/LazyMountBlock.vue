<template>
  <div class="lazy-mount-block">
    <slot v-if="mounted" />
    <div v-else class="lazy-mount-block__placeholder" :style="placeholderStyle">
      <div v-if="title" class="lazy-mount-block__title">{{ title }}</div>
      <el-skeleton animated :rows="rows" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElSkeleton } from 'element-plus';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
  when?: boolean;
  delay?: number;
  idle?: boolean;
  minHeight?: string;
  rows?: number;
  title?: string;
}>(), {
  when: true,
  delay: 120,
  idle: true,
  minHeight: '260px',
  rows: 6,
  title: '',
});

const mounted = ref(false);
let timer: number | null = null;
let idleId: number | null = null;

const placeholderStyle = computed(() => ({ minHeight: props.minHeight }));

function cancelPending() {
  if (timer !== null && typeof window !== 'undefined') {
    window.clearTimeout(timer);
    timer = null;
  }
  if (idleId != null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
    (window as any).cancelIdleCallback(idleId);
    idleId = null;
  }
}

function scheduleMount() {
  cancelPending();
  if (!props.when) {
    mounted.value = false;
    return;
  }
  const commit = () => {
    mounted.value = true;
    idleId = null;
    timer = null;
  };
  if (typeof window === 'undefined') {
    commit();
    return;
  }
  if (props.idle && 'requestIdleCallback' in window) {
    idleId = (window as any).requestIdleCallback(commit, { timeout: Math.max(props.delay, 120) });
    return;
  }
  timer = window.setTimeout(commit, props.delay);
}

watch(() => props.when, () => {
  if (mounted.value && props.when) return;
  scheduleMount();
});

onMounted(() => {
  scheduleMount();
});

onBeforeUnmount(() => {
  cancelPending();
});
</script>

<style scoped>
.lazy-mount-block__placeholder {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 0;
}

.lazy-mount-block__title {
  font-size: 13px;
  color: #909399;
}
</style>
