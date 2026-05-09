import { ElMessage } from './el-services';
import type { LoadingInstance } from "element-plus/es/components/loading/src/loading";
import { ElLoading } from './el-services';

const recentNotice = new Map<string, number>();
const NOTICE_DEDUP_MS = 800;

function canShowNotice(key: string) {
  const now = Date.now();
  const last = recentNotice.get(key) || 0;
  if (now - last < NOTICE_DEDUP_MS) return false;
  recentNotice.set(key, now);
  return true;
}

export function notifyDownloadStarted(filename: string, actionLabel = '下载') {
  const name = String(filename || 'download');
  const key = `${actionLabel}:${name}`;
  if (!canShowNotice(key)) return;
  ElMessage.success(`已开始${actionLabel}：${name}`);
}

export async function withBlockingActionFeedback<T>(label: string, action: () => Promise<T>): Promise<T> {
  let loading: LoadingInstance | undefined;
  try {
    loading = ElLoading.service({
      lock: true,
      text: `${label}中，请稍候…`,
      background: 'rgba(255, 255, 255, 0.55)',
    }) as LoadingInstance;
    return await action();
  } finally {
    try {
      loading?.close();
    } catch {}
  }
}

export function withExportActionFeedback<T>(label: string, action: () => Promise<T>) {
  return withBlockingActionFeedback(label, action);
}

export function saveBlobAsFile(blob: Blob, filename: string, actionLabel = '下载') {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    notifyDownloadStarted(filename, actionLabel);
  } finally {
    URL.revokeObjectURL(url);
  }
}
