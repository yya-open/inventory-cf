import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { apiGet, apiPut } from '../api/client';
import { confirmAction, showError, showPending, showSuccess, showWarning } from '../utils/feedback';
import { confirmRiskAction } from '../utils/riskAction';
import { downloadJobResultCached, openJobResultCached } from '../utils/jobResultCache';
import { canDeleteJob, formatAsyncJobType } from '../utils/asyncJobUi';

/**
 * 异步任务行。后端 listAsyncJobs 返回的字段较多且随 detail 开关变化，
 * 这里只固定两个列表/操作必需的字段，其余按需读取。
 */
export type AsyncJobRow = {
  id: number;
  status: string;
  job_type?: string | null;
  [key: string]: unknown;
};

export type AsyncJobFilters = {
  status: string;
  job_type: string;
  mine: boolean;
  days: number;
};

type JobsListResponse = { data?: unknown; items?: unknown };
type JobsMutateResponse = { message?: string; data?: { deleted?: number; failed?: number }; deleted?: number; failed?: number };

export type UseAsyncJobsOptions = {
  /** 单次请求条数上限，同时作为 Ops 侧列表容量上限 */
  limit: number;
  /** 客户端保留的最大行数；0/未设表示不截断（任务中心用 loadMore 累加） */
  maxRows?: number;
  /** 有运行中任务时的轮询间隔 */
  fastPollMs: number;
  /** 无运行中任务时的轮询间隔 */
  idlePollMs: number;
  /** 页面隐藏时的轮询间隔；0 表示隐藏即暂停轮询 */
  hiddenPollMs: number;
  /** 是否允许调度轮询（Ops 仅在异步任务页签激活时为真） */
  canPoll?: () => boolean;
  /** 每次列表加载成功后的回调，供各视图同步自身派生状态 */
  onLoaded?: (context: { rows: AsyncJobRow[]; usedDelta: boolean }) => void;
  /** 任务被删除后回调，供各视图关闭详情弹层 */
  onJobsRemoved?: (removedIds: number[]) => void;
  /** 清空表格勾选（el-table 的 clearSelection） */
  clearTableSelection?: () => void;
};

export type LoadJobsOptions = {
  /** 允许走 after_id/ids 增量刷新 */
  delta?: boolean;
  /** 静默加载：不显示 loading、不弹错误提示 */
  silent?: boolean;
};

function readRows(payload: JobsListResponse | unknown): AsyncJobRow[] {
  if (Array.isArray(payload)) return payload as AsyncJobRow[];
  if (!payload || typeof payload !== 'object') return [];
  const envelope = payload as { data?: unknown; items?: unknown };
  if (Array.isArray(envelope.items)) return envelope.items as AsyncJobRow[];
  if (Array.isArray(envelope.data)) return envelope.data as AsyncJobRow[];
  const nested = envelope.data as { items?: unknown } | undefined;
  if (nested && Array.isArray(nested.items)) return nested.items as AsyncJobRow[];
  return [];
}

const ACTIVE_STATUSES = ['queued', 'running'];
const DELTA_IDS_CAP = 200;

export function useAsyncJobs(filters: AsyncJobFilters, options: UseAsyncJobsOptions) {
  const pageSize = ref(options.limit);
  const jobs = ref<AsyncJobRow[]>([]);
  const loading = ref(false);
  const loadingMore = ref(false);
  const lastSyncedAt = ref('');
  const lastSyncMode = ref<'full' | 'delta'>('full');
  const hasMore = ref(false);
  const cursorId = ref<number | null>(null);
  const pollEnabled = ref(true);
  const deletingJobId = ref<number | null>(null);
  const batchDeleting = ref(false);
  const selectedJobIds = ref<number[]>([]);
  /** 用于让轮询间隔提示随页面可见性变化重新计算 */
  const documentHidden = ref(typeof document !== 'undefined' && document.hidden);

  let requestSeq = 0;
  let abortController: AbortController | null = null;
  let pollTimer: number | null = null;
  let pollInFlight = false;

  const hasActiveJobs = computed(() => jobs.value.some((row) => ACTIVE_STATUSES.includes(String(row?.status || ''))));

  const deletableSelectedCount = computed(() => {
    if (!selectedJobIds.value.length) return 0;
    const selected = new Set(selectedJobIds.value);
    return jobs.value.filter((row) => selected.has(Number(row?.id || 0)) && canDeleteJob(row)).length;
  });

  const pollDelayMs = computed(() => {
    if (documentHidden.value) return options.hiddenPollMs;
    return hasActiveJobs.value ? options.fastPollMs : options.idlePollMs;
  });

  // 带状态筛选时不能走增量：after_id/ids 只补新增与在跑的行，
  // 状态迁出筛选条件的旧行不会被后端返回，列表会残留脏数据。
  function deltaAllowed() {
    return !String(filters.status || '').trim();
  }

  function buildQuery(extra: { afterId?: number | null; beforeId?: number | null; ids?: number[] } = {}) {
    const q = new URLSearchParams();
    q.set('limit', String(pageSize.value || options.limit));
    q.set('days', String(filters.days || 7));
    if (filters.status) q.set('status', filters.status);
    if (filters.job_type) q.set('job_type', filters.job_type);
    if (filters.mine) q.set('mine', '1');
    if (extra.afterId) q.set('after_id', String(extra.afterId));
    if (extra.beforeId) q.set('before_id', String(extra.beforeId));
    if (extra.ids?.length) q.set('ids', extra.ids.join(','));
    return q.toString();
  }

  function applyRows(incoming: AsyncJobRow[], mode: 'full' | 'delta' | 'append') {
    const map = new Map<number, AsyncJobRow>();
    if (mode !== 'full') {
      for (const row of jobs.value) {
        const id = Number(row?.id || 0);
        if (id > 0) map.set(id, row);
      }
    }
    for (const row of incoming) {
      const id = Number(row?.id || 0);
      if (id > 0) map.set(id, row);
    }
    let next = Array.from(map.values());
    // 全量/追加保留后端 id DESC 顺序；增量合并后需重新排序才能把新行放到顶部。
    if (mode === 'delta') next.sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0));
    if (options.maxRows && next.length > options.maxRows) next = next.slice(0, options.maxRows);
    jobs.value = next;
    cursorId.value = next.length ? Number(next[next.length - 1]?.id || 0) : null;
  }

  function clearPollTimer() {
    if (pollTimer != null) {
      window.clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function schedulePoll(immediate = false) {
    clearPollTimer();
    if (!pollEnabled.value) return;
    if (options.canPoll && !options.canPoll()) return;
    const delay = immediate ? 800 : pollDelayMs.value;
    // hiddenPollMs 为 0 表示隐藏时完全暂停轮询。
    if (!delay) return;
    pollTimer = window.setTimeout(() => {
      if (pollInFlight) {
        schedulePoll();
        return;
      }
      void loadJobs({ delta: true, silent: true });
    }, delay);
  }

  async function loadJobs(opts: LoadJobsOptions = {}) {
    const seq = ++requestSeq;
    if (abortController) {
      try { abortController.abort(); } catch {}
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    abortController = controller;
    if (!opts.silent) loading.value = true;
    pollInFlight = true;

    const activeIds = Array.from(new Set(
      jobs.value
        .filter((row) => ACTIVE_STATUSES.includes(String(row?.status || '')))
        .map((row) => Number(row?.id || 0))
        .filter((id) => Number.isFinite(id) && id > 0)
    )).slice(0, DELTA_IDS_CAP);
    const maxId = jobs.value.reduce((max, row) => Math.max(max, Number(row?.id || 0)), 0);
    const useDelta = !!opts.delta && deltaAllowed() && jobs.value.length > 0 && (maxId > 0 || activeIds.length > 0);
    const query = useDelta
      ? buildQuery({ afterId: maxId > 0 ? maxId : undefined, ids: activeIds })
      : buildQuery();

    try {
      const payload = await apiGet<JobsListResponse>(`/api/jobs?${query}`, controller ? { signal: controller.signal } : {});
      if (seq !== requestSeq) return;
      const rows = readRows(payload);
      applyRows(rows, useDelta ? 'delta' : 'full');
      if (!useDelta) hasMore.value = rows.length >= Number(pageSize.value || options.limit);
      lastSyncMode.value = useDelta ? 'delta' : 'full';
      lastSyncedAt.value = new Date().toISOString();
      options.onLoaded?.({ rows, usedDelta: useDelta });
    } catch (error: unknown) {
      if (seq !== requestSeq) return;
      if (controller?.signal?.aborted) return;
      const err = error as { name?: string; message?: string };
      if (String(err?.name || '') === 'AbortError') return;
      if (!opts.silent) showError(err?.message || '加载任务列表失败');
      hasMore.value = false;
    } finally {
      if (abortController === controller) abortController = null;
      if (seq === requestSeq) {
        pollInFlight = false;
        loading.value = false;
      }
      schedulePoll();
    }
  }

  async function loadMoreJobs() {
    if (!hasMore.value || !cursorId.value || loadingMore.value) return;
    loadingMore.value = true;
    try {
      // 必须用 before_id（id < cursor）。传 after_id 会命中 id > cursor，
      // 即列表里已有的那批行，去重后长度不变，「加载更早任务」看起来毫无反应。
      const payload = await apiGet<JobsListResponse>(`/api/jobs?${buildQuery({ beforeId: cursorId.value })}`);
      const rows = readRows(payload);
      applyRows(rows, 'append');
      hasMore.value = rows.length >= Number(pageSize.value || options.limit);
      lastSyncedAt.value = new Date().toISOString();
      options.onLoaded?.({ rows, usedDelta: false });
    } catch (error: unknown) {
      showError((error as { message?: string })?.message || '加载更多任务失败');
    } finally {
      loadingMore.value = false;
    }
  }

  function applyFilters() {
    hasMore.value = false;
    cursorId.value = null;
    lastSyncMode.value = 'full';
    void loadJobs();
  }

  /** 重试会让任务重新入队执行，与取消一样属于有副作用的高风险动作，两个页面统一走风险确认。 */
  async function retryJob(row: AsyncJobRow | number) {
    const id = typeof row === 'number' ? row : Number(row?.id || 0);
    if (!id) return;
    await confirmRiskAction({ title: '重试异步任务', actionLabel: '重试任务', detail: `任务 #${id} 会重新入队执行。`, affectedRows: 1, irreversible: false });
    const r = await apiPut<JobsMutateResponse>('/api/jobs', { action: 'retry', id });
    showSuccess(r?.message || '已提交重试');
    await loadJobs();
  }

  async function cancelJob(row: AsyncJobRow | number) {
    const id = typeof row === 'number' ? row : Number(row?.id || 0);
    if (!id) return;
    await confirmRiskAction({ title: '取消异步任务', actionLabel: '取消任务', detail: `任务 #${id} 将被取消或进入取消中状态。`, affectedRows: 1, irreversible: false });
    const r = await apiPut<JobsMutateResponse>('/api/jobs', { action: 'cancel', id });
    showSuccess(r?.message || '已取消');
    await loadJobs();
  }

  async function cleanupJobs() {
    await confirmRiskAction({
      title: '自动清理历史任务',
      actionLabel: '清理异步任务历史',
      detail: '会清理过期结果、自动取消排队过久的任务，并删除长期无结果的旧任务。',
      affectedRows: jobs.value.length,
      irreversible: false,
    });
    const r = await apiPut<JobsMutateResponse>('/api/jobs', { action: 'cleanup' });
    showSuccess(r?.message || '已自动清理');
    await loadJobs();
  }

  async function deleteJob(row: AsyncJobRow) {
    if (batchDeleting.value) return;
    const id = Number(row?.id || 0);
    if (!id) return;
    await confirmAction({ title: '提示', message: `确定删除任务“${formatAsyncJobType(row?.job_type)}”吗？删除后不可恢复。`, type: 'warning' });
    deletingJobId.value = id;
    try {
      await apiPut('/api/jobs', { action: 'delete', id });
      options.onJobsRemoved?.([id]);
      showSuccess('任务已删除');
      await loadJobs();
    } finally {
      deletingJobId.value = null;
    }
  }

  async function deleteSelectedJobs() {
    if (batchDeleting.value) return;
    const selected = new Set(selectedJobIds.value);
    const selectedRows = jobs.value.filter((row) => selected.has(Number(row?.id || 0)));
    if (!selectedRows.length) return showWarning('请先勾选任务');
    const deletableRows = selectedRows.filter((row) => canDeleteJob(row));
    const blocked = Math.max(0, selectedRows.length - deletableRows.length);
    if (!deletableRows.length) return showWarning('选中任务均为运行中/排队中，无法删除');

    await confirmAction({
      title: '批量删除任务',
      message: blocked
        ? `确定批量删除 ${deletableRows.length} 条任务吗？其中 ${blocked} 条运行中/排队中任务会自动跳过。`
        : `确定批量删除 ${deletableRows.length} 条任务吗？删除后不可恢复。`,
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });

    const pending = showPending('正在批量删除任务，请稍候…');
    batchDeleting.value = true;
    const removedIds = deletableRows.map((row) => Number(row.id));
    try {
      const result = await apiPut<JobsMutateResponse>('/api/jobs', { action: 'delete_batch', ids: removedIds });
      const success = Number(result?.data?.deleted ?? result?.deleted ?? 0);
      const failed = Number(result?.data?.failed ?? result?.failed ?? 0);
      options.onJobsRemoved?.(removedIds);
      pending.close();
      if (failed) showWarning(`批量删除完成：成功 ${success} 条，失败 ${failed} 条`);
      else showSuccess(`批量删除完成：共删除 ${success} 条`);
      selectedJobIds.value = [];
      options.clearTableSelection?.();
      await loadJobs();
    } catch (error: unknown) {
      pending.close();
      showError((error as { message?: string })?.message || '批量删除任务失败');
    } finally {
      batchDeleting.value = false;
    }
  }

  function onSelectionChange(rows: AsyncJobRow[]) {
    selectedJobIds.value = (rows || [])
      .map((row) => Number(row?.id || 0))
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  function buildJobResultUrl(row: AsyncJobRow, opts: { inline?: boolean; print?: boolean } = {}) {
    const id = Number(row?.id || 0);
    if (!id) return '';
    const q = new URLSearchParams({ id: String(id) });
    if (opts.inline) q.set('inline', '1');
    if (opts.print) q.set('print', '1');
    return `/api/jobs-download?${q.toString()}`;
  }

  async function downloadJob(row: AsyncJobRow) {
    const url = buildJobResultUrl(row);
    if (!url) return;
    try {
      const file = await downloadJobResultCached(url, String(row?.result_filename || '') || undefined);
      if (file.fromCache) showSuccess('已从最近下载缓存读取结果');
    } catch (error: unknown) {
      showError((error as { message?: string })?.message || '下载任务结果失败');
    }
  }

  async function previewJob(row: AsyncJobRow) {
    const url = buildJobResultUrl(row, { inline: true });
    if (!url) return;
    try {
      const file = await openJobResultCached(url, String(row?.result_filename || '') || undefined);
      if (file.fromCache) showSuccess('已从最近预览缓存打开结果');
    } catch (error: unknown) {
      showError((error as { message?: string })?.message || '预览任务结果失败');
    }
  }

  async function printJob(row: AsyncJobRow) {
    const url = buildJobResultUrl(row, { inline: true, print: true });
    if (!url) return;
    try {
      const file = await openJobResultCached(url, String(row?.result_filename || '') || undefined);
      if (file.fromCache) showSuccess('已从最近打印缓存打开结果');
    } catch (error: unknown) {
      showError((error as { message?: string })?.message || '打开打印页失败');
    }
  }

  /** 拉取单条任务的完整详情（detail=1 才返回 request_json / 失败堆栈等字段）。 */
  async function fetchJobDetail(row: AsyncJobRow) {
    try {
      const payload = await apiGet<JobsListResponse>(`/api/jobs?ids=${encodeURIComponent(String(row.id))}&limit=1&days=90&detail=1`);
      return readRows(payload)[0] || row;
    } catch {
      return row;
    }
  }

  function handleVisibilityChange() {
    const hidden = typeof document !== 'undefined' && document.hidden;
    documentHidden.value = hidden;
    if (hidden) {
      // hiddenPollMs 为 0 的视图（任务中心）隐藏即停；其余按后台间隔继续。
      if (!options.hiddenPollMs) clearPollTimer();
      else schedulePoll();
      return;
    }
    if (pollEnabled.value) schedulePoll(true);
  }

  function handlePollToggle() {
    if (!pollEnabled.value) {
      clearPollTimer();
      return;
    }
    void loadJobs({ delta: true, silent: true });
  }

  watch(jobs, () => {
    if (!selectedJobIds.value.length) return;
    const keep = new Set(jobs.value.map((row) => Number(row?.id || 0)).filter((id) => id > 0));
    selectedJobIds.value = selectedJobIds.value.filter((id) => keep.has(id));
  });

  function startVisibilityTracking() {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
  }

  onBeforeUnmount(() => {
    clearPollTimer();
    if (abortController) {
      try { abortController.abort(); } catch {}
      abortController = null;
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleVisibilityChange);
  });

  return {
    jobs,
    pageSize,
    loading,
    loadingMore,
    lastSyncedAt,
    lastSyncMode,
    hasMore,
    cursorId,
    pollEnabled,
    documentHidden,
    deletingJobId,
    batchDeleting,
    selectedJobIds,
    hasActiveJobs,
    deletableSelectedCount,
    pollDelayMs,
    loadJobs,
    loadMoreJobs,
    applyFilters,
    retryJob,
    cancelJob,
    cleanupJobs,
    deleteJob,
    deleteSelectedJobs,
    onSelectionChange,
    downloadJob,
    previewJob,
    printJob,
    fetchJobDetail,
    schedulePoll,
    clearPollTimer,
    startVisibilityTracking,
    handleVisibilityChange,
    handlePollToggle,
  };
}
