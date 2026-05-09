import { ElMessage } from './el-services';

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

