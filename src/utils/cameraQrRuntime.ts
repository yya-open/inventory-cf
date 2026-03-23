import type { Ref } from 'vue';

type BarcodeLike = { rawValue?: string };
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => {
  detect: (source: HTMLVideoElement) => Promise<BarcodeLike[]>;
};

function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  const ctor = typeof window !== 'undefined' ? (window as any).BarcodeDetector : null;
  return typeof ctor === 'function' ? (ctor as BarcodeDetectorCtor) : null;
}

export function cameraQrRuntimeSupported() {
  return !!getBarcodeDetectorCtor() && !!(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia);
}

export function createCameraQrRuntime(videoRef: Ref<HTMLVideoElement | null>, onResult: (raw: string) => void) {
  let stream: MediaStream | null = null;
  let rafId = 0;
  let detector: InstanceType<BarcodeDetectorCtor> | null = null;
  let busy = false;
  let lastRaw = '';
  let lastAt = 0;
  let active = false;

  async function ensureDetector() {
    const Ctor = getBarcodeDetectorCtor();
    if (!Ctor) return null;
    if (!detector) detector = new Ctor({ formats: ['qr_code'] });
    return detector;
  }

  function stopLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    const el = videoRef.value;
    if (el) {
      try { el.pause(); } catch {}
      (el as any).srcObject = null;
    }
  }

  async function scanFrame(onError: (message: string) => void) {
    if (!active) return;
    const el = videoRef.value;
    const currentDetector = await ensureDetector();
    if (!el || !currentDetector || busy || el.readyState < 2) {
      rafId = requestAnimationFrame(() => { scanFrame(onError).catch(() => undefined); });
      return;
    }
    busy = true;
    try {
      const codes = await currentDetector.detect(el);
      const raw = String(codes?.[0]?.rawValue || '').trim();
      const now = Date.now();
      if (raw && (raw !== lastRaw || now - lastAt > 1200)) {
        lastRaw = raw;
        lastAt = now;
        onResult(raw);
      }
    } catch (error: any) {
      onError(error?.message || '摄像头扫码失败');
    } finally {
      busy = false;
      rafId = requestAnimationFrame(() => { scanFrame(onError).catch(() => undefined); });
    }
  }

  async function start(onError: (message: string) => void) {
    onError('');
    if (!cameraQrRuntimeSupported()) {
      onError('当前浏览器不支持摄像头二维码识别，请切换为扫码枪模式。');
      return false;
    }
    if (active) return true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      const el = videoRef.value;
      if (!el) throw new Error('摄像头预览未就绪');
      (el as any).srcObject = stream;
      await el.play();
      active = true;
      stopLoop();
      rafId = requestAnimationFrame(() => { scanFrame(onError).catch(() => undefined); });
      return true;
    } catch (error: any) {
      onError(error?.message || '无法打开摄像头，请检查浏览器权限。');
      stop();
      return false;
    }
  }

  function stop() {
    active = false;
    stopLoop();
    stopStream();
  }

  function isActive() {
    return active;
  }

  return {
    supported: cameraQrRuntimeSupported(),
    start,
    stop,
    isActive,
  };
}
