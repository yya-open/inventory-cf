import { onBeforeUnmount, ref } from 'vue';
import type { AssetQrExportProgress } from '../utils/assetQrExport';

export type QrExportProgressState = {
  visible: boolean;
  title: string;
  stage: string;
  current: number;
  total: number;
  detail: string;
};

export function useQrExportProgress() {
  const qrExportProgress = ref<QrExportProgressState>({
    visible: false,
    title: '',
    stage: '',
    current: 0,
    total: 1,
    detail: '',
  });
  let autoCloseTimer: number | null = null;

  function clearQrExportProgressAutoCloseTimer() {
    if (autoCloseTimer != null) {
      window.clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }
  }

  function startQrExportProgress(title: string) {
    clearQrExportProgressAutoCloseTimer();
    qrExportProgress.value = {
      visible: true,
      title,
      stage: '准备中',
      current: 0,
      total: 1,
      detail: '正在准备导出…',
    };
  }

  function updateQrExportProgress(progress: AssetQrExportProgress) {
    clearQrExportProgressAutoCloseTimer();
    const total = Math.max(1, progress.total);
    qrExportProgress.value = {
      ...qrExportProgress.value,
      visible: true,
      stage: progress.stage,
      current: progress.current,
      total,
      detail: progress.detail || '',
    };
    if (progress.stage === '下载文件' && progress.current >= total) {
      autoCloseTimer = window.setTimeout(() => {
        qrExportProgress.value = { ...qrExportProgress.value, visible: false };
        autoCloseTimer = null;
      }, 600);
    }
  }

  function finishQrExportProgress() {
    clearQrExportProgressAutoCloseTimer();
    qrExportProgress.value = { ...qrExportProgress.value, visible: false };
  }

  onBeforeUnmount(clearQrExportProgressAutoCloseTimer);

  return {
    qrExportProgress,
    startQrExportProgress,
    updateQrExportProgress,
    finishQrExportProgress,
    clearQrExportProgressAutoCloseTimer,
  };
}
