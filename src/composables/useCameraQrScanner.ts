import { onBeforeUnmount, ref, type Ref } from 'vue';

type CameraQrRuntime = {
  supported: boolean;
  start: (onError: (message: string) => void) => Promise<boolean>;
  stop: () => void;
  isActive: () => boolean;
};

function isCameraQrSupported() {
  const BarcodeDetectorCtor = typeof window !== 'undefined' ? (window as any).BarcodeDetector : null;
  return typeof BarcodeDetectorCtor === 'function' && !!(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia);
}

export function useCameraQrScanner(videoRef: Ref<HTMLVideoElement | null>, onResult: (raw: string) => void) {
  const supported = ref(isCameraQrSupported());
  const active = ref(false);
  const starting = ref(false);
  const error = ref('');

  let runtime: CameraQrRuntime | null = null;
  let runtimePromise: Promise<CameraQrRuntime> | null = null;

  async function ensureRuntime() {
    if (runtime) return runtime;
    if (!runtimePromise) {
      runtimePromise = import('../utils/cameraQrRuntime').then(({ createCameraQrRuntime }) => {
        runtime = createCameraQrRuntime(videoRef, onResult);
        supported.value = runtime.supported;
        return runtime;
      });
    }
    return runtimePromise;
  }

  async function start() {
    error.value = '';
    supported.value = isCameraQrSupported();
    if (!supported.value) {
      error.value = '当前浏览器不支持摄像头二维码识别，请切换为扫码枪模式。';
      return false;
    }
    if (active.value || starting.value) return true;
    starting.value = true;
    try {
      const scanner = await ensureRuntime();
      supported.value = scanner.supported;
      const started = await scanner.start((message) => {
        error.value = message;
      });
      active.value = scanner.isActive();
      return started;
    } finally {
      starting.value = false;
    }
  }

  function stop() {
    runtime?.stop();
    active.value = false;
  }

  function clearError() {
    error.value = '';
  }

  onBeforeUnmount(stop);

  return {
    supported,
    active,
    starting,
    error,
    start,
    stop,
    clearError,
  };
}
