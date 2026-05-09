import { ref, unref, type MaybeRef } from 'vue';
import { apiGet, apiPost } from '../api/client';
import { getCachedAssetQr, invalidateAssetQr, setCachedAssetQr, type AssetQrCacheKind } from '../utils/assetQrCache';
import { ElMessage, ElMessageBox } from '../utils/el-services';

type QrImage = {
  dataUrl: string;
  svgMarkup: string;
};

type AssetQrDialogMessages = {
  noPermission: string;
  missingId: string;
  emptyLink: string;
  generateFailed: string;
  copySuccess: string;
  copyFailed: string;
  resetTitle: string;
  resetConfirm: string;
  resetConfirmButton?: string;
  resetSuccess: string;
  resetFailed: string;
};

type UseAssetQrDialogOptions<TAsset> = {
  kind: AssetQrCacheKind;
  size: number;
  canReset: MaybeRef<boolean>;
  getId: (row: TAsset) => number;
  getVersion: (row: Partial<TAsset> | null | undefined) => string;
  qrTokenPath: (id: number) => string;
  resetQrPath: (id: number) => string;
  messages: AssetQrDialogMessages;
  closeOnOpenError?: boolean;
  requireLinkOnOpen?: boolean;
};

let qrCodeLibPromise: Promise<typeof import('qrcode')> | null = null;

function loadQrCodeLib() {
  qrCodeLibPromise ||= import('qrcode');
  return qrCodeLibPromise;
}

async function buildInlineQrSvg(link: string, size: number): Promise<QrImage> {
  const QRCode = await loadQrCodeLib();
  const svgMarkup = await QRCode.toString(link, { type: 'svg', width: Number(size), margin: 2, errorCorrectionLevel: 'Q' });
  return {
    svgMarkup,
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`,
  };
}

async function copyTextWithFallback(text: string) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (typeof document === 'undefined') return false;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  }
}

export function useAssetQrDialog<TAsset extends Record<string, any>>(options: UseAssetQrDialogOptions<TAsset>) {
  const visible = ref(false);
  const loading = ref(false);
  const dataUrl = ref('');
  const svgMarkup = ref('');
  const link = ref('');
  const row = ref<TAsset | null>(null);

  function setQrData(nextLink: string, image: QrImage) {
    link.value = nextLink;
    dataUrl.value = image.dataUrl;
    svgMarkup.value = image.svgMarkup;
  }

  function clearQrData() {
    link.value = '';
    dataUrl.value = '';
    svgMarkup.value = '';
  }

  async function openQr(nextRow: TAsset) {
    visible.value = true;
    row.value = { ...nextRow };
    clearQrData();
    loading.value = true;
    try {
      const id = Number(options.getId(nextRow) || 0);
      if (!id) throw new Error(options.messages.missingId);
      const version = options.getVersion(nextRow);
      const cached = getCachedAssetQr(options.kind, id, version);
      if (cached) {
        link.value = cached.link;
        dataUrl.value = cached.dataUrl;
        svgMarkup.value = cached.svgMarkup || '';
        return;
      }
      const result: any = await apiGet(options.qrTokenPath(id));
      const nextLink = String(result?.url || '');
      if (!nextLink && options.requireLinkOnOpen !== false) throw new Error(options.messages.emptyLink);
      link.value = nextLink;
      if (!nextLink) return;
      const image = await buildInlineQrSvg(nextLink, options.size);
      setQrData(nextLink, image);
      setCachedAssetQr(options.kind, id, version, { link: nextLink, dataUrl: image.dataUrl, svgMarkup: image.svgMarkup });
    } catch (error: any) {
      ElMessage.error(error?.message || options.messages.generateFailed);
      if (options.closeOnOpenError) visible.value = false;
    } finally {
      loading.value = false;
    }
  }

  async function resetQr() {
    if (!unref(options.canReset)) {
      ElMessage.warning(options.messages.noPermission);
      return;
    }
    try {
      const id = Number(row.value ? options.getId(row.value) : 0);
      if (!id) return;
      await ElMessageBox.confirm(options.messages.resetConfirm, options.messages.resetTitle, {
        type: 'warning',
        confirmButtonText: options.messages.resetConfirmButton || '重置',
        cancelButtonText: '取消',
      });
      loading.value = true;
      invalidateAssetQr(options.kind, id);
      const result: any = await apiPost(options.resetQrPath(id), {});
      const nextLink = String(result?.url || '');
      link.value = nextLink;
      if (nextLink) {
        const image = await buildInlineQrSvg(nextLink, options.size);
        setQrData(nextLink, image);
        const version = new Date().toISOString();
        row.value = row.value ? { ...row.value, qr_updated_at: version } : row.value;
        setCachedAssetQr(options.kind, id, version, { link: nextLink, dataUrl: image.dataUrl, svgMarkup: image.svgMarkup });
      }
      ElMessage.success(options.messages.resetSuccess);
    } catch (error: any) {
      if (error === 'cancel' || error === 'close') return;
      ElMessage.error(error?.message || options.messages.resetFailed);
    } finally {
      loading.value = false;
    }
  }

  async function copyLink() {
    const copied = await copyTextWithFallback(link.value);
    if (copied) {
      ElMessage.success(options.messages.copySuccess);
      return;
    }
    ElMessage.warning(options.messages.copyFailed);
  }

  function openLink() {
    if (link.value) window.open(link.value, '_blank');
  }

  return {
    visible,
    loading,
    dataUrl,
    svgMarkup,
    link,
    row,
    openQr,
    resetQr,
    copyLink,
    openLink,
  };
}
