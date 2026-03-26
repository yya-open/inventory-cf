import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage } from '../utils/el-services';
import { apiGetPublic, apiPostPublic } from '../api/client';
import { DEFAULT_SYSTEM_SETTINGS, fetchPublicSettings, type PublicScanMode, type SystemSettings } from '../api/systemSettings';
import { buildPublicQuery, enqueuePendingPublicSubmission, flushPendingPublicSubmissions, getWeakNetworkText, isNetworkError, loadPendingPublicSubmissions, loadRecentPublicTargets, parsePublicTargetInput, saveRecentPublicTarget, triggerSuccessVibration, type PendingPublicSubmission } from '../utils/publicInventory';

type PublicInventoryKind = 'pc' | 'monitor';
type NextSource = 'manual' | 'scanner' | 'camera';
type RetryAction = null | 'refresh' | 'ok' | 'issue';
type SubmitPayload = { action: 'OK' | 'ISSUE'; issue_type?: string; remark?: string };
export type PublicInventorySessionSummary = {
  batch_name: string | null;
  started_at: string;
  processed: number;
  ok: number;
  issue: number;
  last_target: string | null;
};

export type PublicInventoryRecentResult = {
  action: 'OK' | 'ISSUE';
  issue_type?: string | null;
  remark?: string | null;
  created_at: string;
  source: 'success' | 'duplicate';
  target_label: string;
  message?: string | null;
};

export function usePublicInventoryPage(options: {
  kind: PublicInventoryKind;
  detailPath: string;
  inventoryPath: string;
  autoFocusAfterSubmit?: 'scanner-only' | 'always';
}) {
  const settings = ref<SystemSettings>({ ...DEFAULT_SYSTEM_SETTINGS });
  const loading = ref(true);
  const error = ref('');
  const row = ref<any>(null);
  const id = ref('');
  const key = ref('');
  const token = ref('');
  const submittingOk = ref(false);
  const submittingIssue = ref(false);
  const issueVisible = ref(false);
  const issueForm = ref({ issue_type: '', remark: '' });
  const cooldownLeft = ref(0);
  const kindLabel = options.kind === 'pc' ? '电脑' : '显示器';
  const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280);
  const descColumns = computed(() => (viewportWidth.value < 640 ? 1 : 2));
  const isMobile = computed(() => viewportWidth.value < 640);
  const continuousMode = ref(true);
  const scanMode = ref<PublicScanMode>('scanner');
  const nextInput = ref('');
  const nextInputRef = ref<any>(null);
  const cameraVideoRef = ref<HTMLVideoElement | null>(null);
  const recentTargets = ref<string[]>([]);
  const weakNetworkHint = ref('');
  const retryMessage = ref('');
  const retryAction = ref<RetryAction>(null);
  const pendingQueue = ref<PendingPublicSubmission[]>([]);
  const flushingQueue = ref(false);
  const recentResult = ref<PublicInventoryRecentResult | null>(null);
  const sessionSummary = ref<PublicInventorySessionSummary | null>(null);
  const scanModeOptions = computed(() => ([
    { label: '手动', value: 'manual' },
    { label: '扫码枪', value: 'scanner' },
    { label: '摄像头', value: 'camera', disabled: !cameraSupported.value },
  ]));
  const nextInputPlaceholder = computed(() => scanMode.value === 'camera'
    ? '摄像头模式下，也可手动粘贴下一项二维码链接 / token'
    : '粘贴或扫描下一项二维码链接 / token，扫码枪回车可直接切换');
  const scannerTip = computed(() => {
    if (scanMode.value === 'camera') {
      if (!cameraSupported.value) return '当前浏览器不支持摄像头连续扫码，请切换为扫码枪模式。';
      if (cameraError.value) return cameraError.value;
      return cameraActive.value ? '摄像头扫码中：对准下一项二维码后会自动切到下一项。' : '摄像头模式已选择：点击“启动摄像头”后即可连续识别二维码。';
    }
    if (scanMode.value === 'scanner') return '扫码枪模式已开启：输入框会自动保持焦点，识别到完整二维码链接或 token 后会自动切换。';
    return '手动模式：可粘贴二维码链接或 token 后按回车或点击按钮切换。';
  });

  const waitingForScan = computed(() => !loading.value && !error.value && !row.value && !id.value && !key.value && !token.value);
  const inventoryReady = computed(() => Boolean(row.value?.inventory_batch_active));
  const inventoryDisabledReason = computed(() => {
    if (waitingForScan.value) return `请先扫描${kindLabel}二维码，进入当前盘点项后再提交在位或异常。`;
    const batchName = String(row.value?.inventory_batch_name || '').trim();
    return batchName
      ? `当前盘点轮次未处于进行中状态，请先回到台账页重新开启“${batchName}”或新建一轮盘点后再扫码提交。`
      : `当前未开启${kindLabel}盘点，请先在${kindLabel}台账页点击“开启新一轮”后再扫码提交。`;
  });
  const actionDisabled = computed(() => cooldownLeft.value > 0 || !inventoryReady.value || waitingForScan.value);

  let cooldownTimer: ReturnType<typeof setInterval> | null = null;
  let scannerTimer: ReturnType<typeof setTimeout> | null = null;
  const cooldownStorageKey = `inventory-public-submit-cooldown:${options.kind}`;
  const recentResultStorageKey = `inventory-public-last-result:${options.kind}`;
  const sessionSummaryStorageKey = `inventory-public-session-summary:${options.kind}`;
  const cameraSupported = ref(typeof window !== 'undefined' ? typeof (window as any).BarcodeDetector === 'function' && !!navigator.mediaDevices?.getUserMedia : false);
  const cameraActive = ref(false);
  const cameraStarting = ref(false);
  const cameraError = ref('');

  type CameraQrRuntime = {
    supported: boolean;
    start: (onError: (message: string) => void) => Promise<boolean>;
    stop: () => void;
    isActive: () => boolean;
  };
  let cameraRuntime: CameraQrRuntime | null = null;
  let cameraRuntimePromise: Promise<CameraQrRuntime> | null = null;

  function detectCameraSupport() {
    const BarcodeDetectorCtor = typeof window !== 'undefined' ? (window as any).BarcodeDetector : null;
    return typeof BarcodeDetectorCtor === 'function' && !!(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia);
  }

  async function ensureCameraRuntime() {
    if (cameraRuntime) return cameraRuntime;
    if (!cameraRuntimePromise) {
      cameraRuntimePromise = import('../utils/cameraQrRuntime').then(({ createCameraQrRuntime }) => {
        cameraRuntime = createCameraQrRuntime(cameraVideoRef, (raw) => {
          if (!continuousMode.value || scanMode.value !== 'camera') return;
          const target = parsePublicTargetInput(raw);
          if (!target) return;
          goNextToTarget(target, 'camera');
        });
        cameraSupported.value = Boolean(cameraRuntime?.supported);
        return cameraRuntime;
      });
    }
    return cameraRuntimePromise;
  }

  async function startCamera() {
    cameraError.value = '';
    cameraSupported.value = detectCameraSupport();
    if (!cameraSupported.value) {
      cameraError.value = '当前浏览器不支持摄像头二维码识别，请切换为扫码枪模式。';
      return false;
    }
    if (cameraActive.value || cameraStarting.value) return true;
    cameraStarting.value = true;
    try {
      const runtime = await ensureCameraRuntime();
      cameraSupported.value = Boolean(runtime?.supported);
      const started = await runtime.start((message) => {
        cameraError.value = message;
      });
      cameraActive.value = Boolean(runtime?.isActive());
      return started;
    } finally {
      cameraStarting.value = false;
    }
  }

  function stopCamera() {
    cameraRuntime?.stop();
    cameraActive.value = false;
  }

  function clearCameraError() {
    cameraError.value = '';
  }

  function handleResize() {
    viewportWidth.value = window.innerWidth;
  }

  function handleNetworkChange() {
    weakNetworkHint.value = settings.value.public_inventory_retry_hint ? getWeakNetworkText() : '';
  }

  function recentLabel(item: string) {
    const q = new URLSearchParams(item);
    return q.get('id') || q.get('token')?.slice(0, 12) || item.slice(0, 14);
  }

  function formatRecentResultTime(value?: string | null) {
    if (value) return String(value);
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(new Date()).replace(/\//g, '-');
    } catch {
      return new Date().toLocaleString();
    }
  }

  function buildCurrentTargetLabel() {
    if (options.kind === 'pc') {
      const title = [row.value?.brand, row.value?.model].filter(Boolean).join(' ') || '电脑';
      return `${title} · SN ${row.value?.serial_no || '-'}`;
    }
    const title = [row.value?.brand, row.value?.model].filter(Boolean).join(' ') || '显示器';
    return `${title} · ${row.value?.asset_code || row.value?.sn || '-'}`;
  }

  function loadRecentResult() {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(recentResultStorageKey);
      recentResult.value = raw ? JSON.parse(raw) : null;
    } catch {
      recentResult.value = null;
    }
  }

  function saveRecentResult(record: PublicInventoryRecentResult) {
    recentResult.value = record;
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(recentResultStorageKey, JSON.stringify(record));
    } catch {}
  }

  function loadSessionSummary() {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(sessionSummaryStorageKey);
      sessionSummary.value = raw ? JSON.parse(raw) : null;
    } catch {
      sessionSummary.value = null;
    }
  }

  function saveSessionSummary(record: PublicInventorySessionSummary | null) {
    sessionSummary.value = record;
    if (typeof window === 'undefined') return;
    try {
      if (!record) window.sessionStorage.removeItem(sessionSummaryStorageKey);
      else window.sessionStorage.setItem(sessionSummaryStorageKey, JSON.stringify(record));
    } catch {}
  }

  function ensureSessionSummary(batchName?: string | null) {
    const normalized = String(batchName || '').trim() || null;
    if (!normalized) return;
    const current = sessionSummary.value;
    if (current?.batch_name === normalized) return;
    saveSessionSummary({
      batch_name: normalized,
      started_at: formatRecentResultTime(),
      processed: 0,
      ok: 0,
      issue: 0,
      last_target: null,
    });
  }

  function recordSessionSummary(action: 'OK' | 'ISSUE') {
    const batchName = String(row.value?.inventory_batch_name || '').trim() || null;
    if (!batchName) return;
    ensureSessionSummary(batchName);
    const current = sessionSummary.value || { batch_name: batchName, started_at: formatRecentResultTime(), processed: 0, ok: 0, issue: 0, last_target: null };
    const next = {
      ...current,
      batch_name: batchName,
      processed: Number(current.processed || 0) + 1,
      ok: Number(current.ok || 0) + (action === 'OK' ? 1 : 0),
      issue: Number(current.issue || 0) + (action === 'ISSUE' ? 1 : 0),
      last_target: buildCurrentTargetLabel(),
    };
    saveSessionSummary(next);
  }

  function resetSessionSummary() {
    saveSessionSummary(null);
  }

  function rememberRecentResult(payload: SubmitPayload | { action: string; issue_type?: string | null; remark?: string | null }, source: 'success' | 'duplicate', message?: string | null, createdAt?: string | null) {
    const action = String(payload?.action || '').toUpperCase() === 'ISSUE' ? 'ISSUE' : 'OK';
    saveRecentResult({
      action,
      issue_type: payload?.issue_type ? String(payload.issue_type).toUpperCase() : null,
      remark: payload?.remark ? String(payload.remark) : null,
      created_at: formatRecentResultTime(createdAt),
      source,
      target_label: buildCurrentTargetLabel(),
      message: message || null,
    });
  }

  function clearRetry() {
    retryMessage.value = '';
    retryAction.value = null;
  }

  function refreshPendingQueue() {
    pendingQueue.value = loadPendingPublicSubmissions(options.kind);
  }

  async function toggleCamera() {
    if (cameraActive.value) stopCamera();
    else await startCamera();
  }

  async function retryCamera() {
    clearCameraError();
    await startCamera();
  }

  function focusNextInput() {
    nextTick(() => {
      const target = nextInputRef.value;
      if (target && typeof target.focus === 'function') target.focus();
    });
  }

  function scheduleScannerAutoGo() {
    if (!continuousMode.value || scanMode.value !== 'scanner') return;
    const target = parsePublicTargetInput(nextInput.value);
    if (!target) return;
    if (scannerTimer) clearTimeout(scannerTimer);
    scannerTimer = setTimeout(() => {
      if (continuousMode.value && scanMode.value === 'scanner' && parsePublicTargetInput(nextInput.value)) {
        goNextFromInput();
      }
    }, 90);
  }

  function currentTargetCooldownKey(target?: { id?: string; key?: string; token?: string } | null) {
    const targetId = (target?.id || id.value || '').trim();
    const targetKey = (target?.key || key.value || '').trim();
    const targetToken = (target?.token || token.value || '').trim();
    if (targetToken) return `token:${targetToken}`;
    if (targetId && targetKey) return `pair:${targetId}:${targetKey}`;
    return '';
  }

  function loadCooldownMap() {
    if (typeof window === 'undefined') return {} as Record<string, number>;
    try {
      const raw = window.sessionStorage.getItem(cooldownStorageKey);
      if (!raw) return {} as Record<string, number>;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {} as Record<string, number>;
    } catch {
      return {} as Record<string, number>;
    }
  }

  function saveCooldownMap(map: Record<string, number>) {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(cooldownStorageKey, JSON.stringify(map));
    } catch {}
  }

  function cleanupCooldownMap(map: Record<string, number>) {
    const now = Date.now();
    for (const [entryKey, expiresAt] of Object.entries(map)) {
      if (!Number.isFinite(expiresAt) || expiresAt <= now) delete map[entryKey];
    }
    return map;
  }

  function syncCooldownForCurrentTarget() {
    const currentKey = currentTargetCooldownKey();
    if (!currentKey) {
      cooldownLeft.value = 0;
      if (cooldownTimer) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
      }
      return;
    }
    const map = cleanupCooldownMap(loadCooldownMap());
    saveCooldownMap(map);
    const expiresAt = Number(map[currentKey] || 0);
    const nextLeft = expiresAt > Date.now() ? Math.ceil((expiresAt - Date.now()) / 1000) : 0;
    cooldownLeft.value = nextLeft;
    if (cooldownTimer) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
    if (nextLeft > 0) {
      cooldownTimer = setInterval(() => {
        const currentMap = cleanupCooldownMap(loadCooldownMap());
        saveCooldownMap(currentMap);
        const currentExpiresAt = Number(currentMap[currentKey] || 0);
        const remaining = currentExpiresAt > Date.now() ? Math.ceil((currentExpiresAt - Date.now()) / 1000) : 0;
        cooldownLeft.value = remaining;
        if (remaining <= 0 && cooldownTimer) {
          clearInterval(cooldownTimer);
          cooldownTimer = null;
        }
      }, 1000);
    }
  }

  function startCooldown(seconds = settings.value.public_inventory_cooldown_seconds, target?: { id?: string; key?: string; token?: string } | null) {
    const currentKey = currentTargetCooldownKey(target);
    if (!currentKey) {
      cooldownLeft.value = 0;
      return;
    }
    const map = cleanupCooldownMap(loadCooldownMap());
    map[currentKey] = Date.now() + Math.max(1, seconds) * 1000;
    saveCooldownMap(map);
    if (scannerTimer) clearTimeout(scannerTimer);
    syncCooldownForCurrentTarget();
  }

  function syncFromLocation() {
    const url = new URL(window.location.href);
    id.value = (url.searchParams.get('id') || '').trim();
    key.value = (url.searchParams.get('key') || '').trim();
    token.value = (url.searchParams.get('token') || '').trim();
  }

  function goNextToTarget(target: any, source: NextSource = 'manual') {
    const url = new URL(window.location.href);
    url.search = buildPublicQuery(target);
    window.history.replaceState({}, '', url.toString());
    nextInput.value = '';
    void refresh();
    if (continuousMode.value && source === 'scanner') focusNextInput();
  }

  function openRecent(item: string) {
    const target = parsePublicTargetInput(`?${item}`);
    if (!target) return;
    goNextToTarget(target, 'manual');
  }

  function goNextFromInput() {
    const target = parsePublicTargetInput(nextInput.value);
    if (!target) return ElMessage.warning('请先粘贴下一项二维码链接 / token，或使用扫码枪 / 摄像头连续扫码');
    goNextToTarget(target, scanMode.value === 'scanner' ? 'scanner' : 'manual');
  }

  async function loadPublicConfig() {
    try {
      settings.value = await fetchPublicSettings();
      continuousMode.value = settings.value.public_inventory_continuous_mode_default;
      scanMode.value = settings.value.public_inventory_scan_mode_default;
      if (scanMode.value === 'camera' && !cameraSupported.value) scanMode.value = 'scanner';
    } catch {}
    handleNetworkChange();
  }

  async function refresh() {
    loading.value = true;
    error.value = '';
    clearRetry();
    try {
      if (scannerTimer) {
        clearTimeout(scannerTimer);
        scannerTimer = null;
      }
      syncFromLocation();
      let apiUrl = '';
      if (id.value && key.value) apiUrl = `${options.detailPath}?id=${encodeURIComponent(id.value)}&key=${encodeURIComponent(key.value)}`;
      else if (token.value) apiUrl = `${options.detailPath}?token=${encodeURIComponent(token.value)}`;
      else {
        row.value = null;
        syncCooldownForCurrentTarget();
        recentTargets.value = loadRecentPublicTargets(options.kind);
        refreshPendingQueue();
        return;
      }
      const result: any = await apiGetPublic(apiUrl);
      row.value = result.data;
      ensureSessionSummary(row.value?.inventory_batch_name);
      syncCooldownForCurrentTarget();
      saveRecentPublicTarget(options.kind, token.value ? { token: token.value } : { id: id.value, key: key.value });
      recentTargets.value = loadRecentPublicTargets(options.kind);
      refreshPendingQueue();
    } catch (err: any) {
      error.value = err?.message || '获取失败';
      if (isNetworkError(err)) {
        retryMessage.value = '网络请求失败，请检查网络后重试。';
        retryAction.value = 'refresh';
      }
    } finally {
      loading.value = false;
    }
  }

  function inventoryApiUrl(target?: any) {
    const targetId = target?.id || id.value;
    const targetKey = target?.key || key.value;
    const targetToken = target?.token || token.value;
    if (targetId && targetKey) return `${options.inventoryPath}?id=${encodeURIComponent(targetId)}&key=${encodeURIComponent(targetKey)}`;
    if (targetToken) return `${options.inventoryPath}?token=${encodeURIComponent(targetToken)}`;
    return '';
  }

  async function onSubmitSuccess(message: string, payload: SubmitPayload) {
    rememberRecentResult(payload, 'success', message);
    recordSessionSummary(payload.action);
    ElMessage.success(message);
    triggerSuccessVibration(settings.value.public_inventory_auto_vibrate);
    startCooldown(settings.value.public_inventory_cooldown_seconds);
    if (!continuousMode.value) return;
    if (options.autoFocusAfterSubmit === 'always') {
      if (nextInput.value.trim()) setTimeout(() => goNextFromInput(), 160);
      else focusNextInput();
      return;
    }
    if (scanMode.value === 'scanner' && nextInput.value.trim()) {
      setTimeout(() => goNextFromInput(), 160);
    }
  }

  async function sendInventoryPayload(target: any, payload: SubmitPayload) {
    const apiUrl = inventoryApiUrl(target);
    if (!apiUrl) throw new Error('缺少二维码参数');
    await apiPostPublic(apiUrl, payload);
  }

  async function flushPendingQueue() {
    if (!pendingQueue.value.length) return;
    try {
      flushingQueue.value = true;
      const result = await flushPendingPublicSubmissions(options.kind, sendInventoryPayload);
      refreshPendingQueue();
      if (result.sent) ElMessage.success(`已补交 ${result.sent} 条待重试记录`);
      if (result.failed) ElMessage.warning(`仍有 ${result.failed} 条待重试记录未成功提交`);
    } catch (err: any) {
      ElMessage.error(err?.message || '提交待重试记录失败');
    } finally {
      flushingQueue.value = false;
    }
  }

  function queuePending(payload: SubmitPayload, label: string) {
    const target = token.value ? { token: token.value } : { id: id.value, key: key.value };
    enqueuePendingPublicSubmission(options.kind, target, payload, label);
    refreshPendingQueue();
  }

  function warnInventoryInactive() {
    ElMessage.warning(inventoryDisabledReason.value);
  }

  function openIssueDialog() {
    if (!inventoryReady.value) {
      warnInventoryInactive();
      return;
    }
    issueVisible.value = true;
  }

  async function submitOk() {
    try {
      clearRetry();
      if (!inventoryReady.value) {
        warnInventoryInactive();
        return;
      }
      if (!inventoryApiUrl()) throw new Error('缺少二维码参数');
      submittingOk.value = true;
      const payload = { action: 'OK' } as const;
      await sendInventoryPayload(undefined, payload);
      await onSubmitSuccess('已记录：盘点通过', payload);
    } catch (err: any) {
      if (Number(err?.status || 0) === 409) {
        const existing = err?.response?.data || null;
        if (existing?.action) rememberRecentResult(existing, 'duplicate', err?.message || '该设备本轮已存在盘点记录', existing?.created_at || null);
        ElMessage.warning(err?.message || '该设备当前不可提交盘点结果，请稍后重试。');
        return;
      }
      if (isNetworkError(err)) {
        retryMessage.value = '网络较弱，盘点结果已加入待重试队列，可点击重试或稍后统一补交。';
        retryAction.value = 'ok';
        queuePending({ action: 'OK' }, '盘点通过');
      }
      ElMessage.error(err?.message || '提交失败');
    } finally {
      submittingOk.value = false;
    }
  }

  async function submitIssue() {
    try {
      clearRetry();
      if (!inventoryReady.value) {
        warnInventoryInactive();
        return;
      }
      if (!inventoryApiUrl()) throw new Error('缺少二维码参数');
      if (!issueForm.value.issue_type) throw new Error('请选择异常类型');
      submittingIssue.value = true;
      const payload = { action: 'ISSUE', issue_type: issueForm.value.issue_type, remark: issueForm.value.remark } as const;
      await sendInventoryPayload(undefined, payload);
      issueVisible.value = false;
      issueForm.value = { issue_type: '', remark: '' };
      await onSubmitSuccess('已提交：异常', payload);
    } catch (err: any) {
      if (Number(err?.status || 0) === 409) {
        const existing = err?.response?.data || null;
        if (existing?.action) rememberRecentResult(existing, 'duplicate', err?.message || '该设备本轮已存在盘点记录', existing?.created_at || null);
        ElMessage.warning(err?.message || '该设备当前不可提交异常，请稍后重试。');
        return;
      }
      if (isNetworkError(err)) {
        retryMessage.value = '网络较弱，异常结果已加入待重试队列，可点击重试或稍后统一补交。';
        retryAction.value = 'issue';
        queuePending({ action: 'ISSUE', issue_type: issueForm.value.issue_type, remark: issueForm.value.remark }, '异常提交');
      }
      ElMessage.error(err?.message || '提交失败');
    } finally {
      submittingIssue.value = false;
    }
  }

  function retryLast() {
    if (retryAction.value === 'ok') return submitOk();
    if (retryAction.value === 'issue') return submitIssue();
    return refresh();
  }

  function handleOnline() {
    handleNetworkChange();
    void flushPendingQueue();
  }

  watch(() => settings.value.public_inventory_retry_hint, handleNetworkChange);
  watch(() => pendingQueue.value.length, (count) => {
    if (!count && retryAction.value && retryMessage.value.includes('待重试')) clearRetry();
  });
  watch([continuousMode, scanMode], async ([enabled, mode]) => {
    if (!enabled) {
      stopCamera();
      return;
    }
    if (mode === 'scanner') {
      stopCamera();
      focusNextInput();
      return;
    }
    if (mode === 'camera') {
      if (!cameraSupported.value) {
        scanMode.value = 'scanner';
        return;
      }
      await startCamera();
      return;
    }
    stopCamera();
  });
  watch(nextInput, () => {
    if (scanMode.value === 'scanner') scheduleScannerAutoGo();
  });

  onMounted(async () => {
    await loadPublicConfig();
    loadRecentResult();
    loadSessionSummary();
    recentTargets.value = loadRecentPublicTargets(options.kind);
    refreshPendingQueue();
    await refresh();
    if (navigator.onLine && pendingQueue.value.length) {
      void flushPendingQueue();
    }
    syncCooldownForCurrentTarget();
    if (continuousMode.value && scanMode.value === 'scanner') focusNextInput();
    if (continuousMode.value && scanMode.value === 'camera') await startCamera();
    window.addEventListener('resize', handleResize);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleNetworkChange);
  });

  onBeforeUnmount(() => {
    if (cooldownTimer) clearInterval(cooldownTimer);
    if (scannerTimer) clearTimeout(scannerTimer);
    stopCamera();
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleNetworkChange);
  });

  return {
    settings, loading, error, row, id, key, token, submittingOk, submittingIssue, issueVisible, issueForm, cooldownLeft,
    viewportWidth, descColumns, isMobile, continuousMode, scanMode, nextInput, nextInputRef, cameraVideoRef, recentTargets,
    weakNetworkHint, retryMessage, retryAction, pendingQueue, flushingQueue, recentResult, sessionSummary, scanModeOptions, nextInputPlaceholder, scannerTip,
    waitingForScan, inventoryReady, inventoryDisabledReason, actionDisabled,
    cameraSupported, cameraActive, cameraStarting, cameraError, toggleCamera, retryCamera, recentLabel, refresh, openRecent,
    goNextFromInput, submitOk, submitIssue, openIssueDialog, retryLast, flushPendingQueue, clearRetry, resetSessionSummary,
  };
}
