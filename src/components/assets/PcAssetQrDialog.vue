<template>
  <AssetQrDialogBase
    v-bind="dialogProps"
    @update:visible="emit('update:visible', $event)"
    @download-qr="emit('download-qr')"
    @download-label="emit('download-label')"
    @open-link="emit('open-link')"
    @copy-link="emit('copy-link')"
    @reset="emit('reset-qr')"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AssetQrDialogBase from './AssetQrDialogBase.vue';

const props = defineProps<{
  visible: boolean;
  loading: boolean;
  dataUrl: string;
  link: string;
  row: Record<string, any> | null;
  isAdmin: boolean;
  canExport: boolean;
  canReset: boolean;
  statusText: (status: string) => string;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  'download-qr': [];
  'download-label': [];
  'open-link': [];
  'copy-link': [];
  'reset-qr': [];
}>();

const assetName = computed(() => {
  const parts = [props.row?.brand, props.row?.model]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return parts.length ? parts.join(' · ') : '电脑二维码';
});

const dialogProps = computed(() => ({
  visible: props.visible,
  loading: props.loading,
  dataUrl: props.dataUrl,
  link: props.link,
  row: props.row,
  canExport: props.canExport,
  canReset: props.canReset,
  statusText: props.statusText,
  headerEyebrow: 'PC QR CODE',
  headerTitle: '扫码查看电脑信息',
  headerDesc: '可控长期码 · 信息实时更新',
  assetName: assetName.value,
  metaItems: [
    { label: 'SN', value: props.row?.serial_no || '-' },
    { label: '状态', value: props.statusText(String(props.row?.status || '')) },
  ],
}));
</script>
