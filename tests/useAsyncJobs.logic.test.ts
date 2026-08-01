// @vitest-environment happy-dom
import { createApp } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * useAsyncJobs 的纯逻辑行为测试（借 happy-dom 提供 document/window，让 composable 内的
 * documentHidden 初始化、onBeforeUnmount 等 DOM/生命周期访问在真实组件实例下正常工作）。
 *
 * 覆盖此前只靠肉眼审查、且已真实踩过坑的分支：
 *  (a) applyRows 增量合并：按 id 去重并重排 id DESC；
 *  (b) after_id vs before_id：loadJobs 增量用 after_id=当前最大 id，loadMoreJobs 用 before_id=cursor
 *      —— 这正是「加载更早任务」翻页 bug 的根因，断言 loadMoreJobs 发的是 before_id 而非 after_id；
 *  (c) requestSeq 丢弃陈旧响应：被顶替的慢响应回来后不得覆盖更新的状态；
 *  (d) deltaAllowed：带 status 过滤时禁用增量（退回全量）；
 *  (e) maxRows 截断。
 *
 * api/client 与三个会拉起 Element Plus 的工具模块全部 mock，保证测试隔离、快速、确定。
 */

const apiGet = vi.fn();
const apiPut = vi.fn();

vi.mock('../src/api/client', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args),
  apiPut: (...args: unknown[]) => apiPut(...args),
}));
vi.mock('../src/utils/feedback', () => ({
  confirmAction: vi.fn(),
  showError: vi.fn(),
  showPending: vi.fn(() => ({ close: vi.fn() })),
  showSuccess: vi.fn(),
  showWarning: vi.fn(),
}));
vi.mock('../src/utils/riskAction', () => ({ confirmRiskAction: vi.fn() }));
vi.mock('../src/utils/jobResultCache', () => ({
  downloadJobResultCached: vi.fn(),
  openJobResultCached: vi.fn(),
}));

import { useAsyncJobs, type AsyncJobFilters, type UseAsyncJobsOptions } from '../src/composables/useAsyncJobs';

let unmount: (() => void) | null = null;

/**
 * 把 composable 挂进一个最小组件实例后返回其 API 与 unmount。
 * 用真实组件（而非 effectScope）承载，onBeforeUnmount 才有实例可绑定、卸载时真正清理。
 * 泛型以传入函数为类型参数，api 类型由其返回值推断，无需命名 useAsyncJobs 的返回类型。
 */
function mountComposable<T>(fn: () => T): { api: T; unmount: () => void } {
  let api!: T;
  const app = createApp({ setup() { api = fn(); return () => null; } });
  app.mount(document.createElement('div'));
  return { api, unmount: () => app.unmount() };
}

/** 实例化 useAsyncJobs；canPoll:false 关掉一切轮询定时器，测试无时间依赖。 */
function harness(filters: Partial<AsyncJobFilters> = {}, options: Partial<UseAsyncJobsOptions> = {}) {
  const fullFilters: AsyncJobFilters = { status: '', job_type: '', mine: false, days: 7, ...filters };
  const fullOptions: UseAsyncJobsOptions = {
    limit: 20,
    fastPollMs: 3000,
    idlePollMs: 8000,
    hiddenPollMs: 0,
    canPoll: () => false,
    ...options,
  };
  const mounted = mountComposable(() => useAsyncJobs(fullFilters, fullOptions));
  unmount = mounted.unmount;
  return { api: mounted.api };
}

/** 后端返回的 envelope 形状：{ data: rows }。readRows 会从 data 数组取行。 */
function envelope(ids: number[], status = 'success') {
  return { data: ids.map((id) => ({ id, status, job_type: 'DASHBOARD_PRECOMPUTE' })) };
}

/** 从最近一次 apiGet 调用的 url 里解析 query。 */
function lastQuery() {
  const url = String(apiGet.mock.calls.at(-1)?.[0] ?? '');
  return new URLSearchParams(url.split('?')[1] ?? '');
}

beforeEach(() => {
  apiGet.mockReset();
  apiPut.mockReset();
});

afterEach(() => {
  unmount?.();
  unmount = null;
});

describe('useAsyncJobs 纯逻辑', () => {
  it('(a) 增量合并按 id 去重并重排 id DESC', async () => {
    const { api } = harness();
    // 全量：后端按 id DESC 返回 [3,1]
    apiGet.mockResolvedValueOnce(envelope([3, 1]));
    await api.loadJobs();
    expect(api.jobs.value.map((r) => r.id)).toEqual([3, 1]);

    // 增量：返回新行 2 与被更新的 3（status 变了）。合并去重后应为 [3,2,1] 且 3 用新状态。
    apiGet.mockResolvedValueOnce({ data: [
      { id: 2, status: 'success', job_type: 'DASHBOARD_PRECOMPUTE' },
      { id: 3, status: 'running', job_type: 'DASHBOARD_PRECOMPUTE' },
    ] });
    await api.loadJobs({ delta: true });

    expect(api.jobs.value.map((r) => r.id)).toEqual([3, 2, 1]);
    expect(api.jobs.value.find((r) => r.id === 3)?.status).toBe('running');
    // 去重：id=3 只出现一次
    expect(api.jobs.value.filter((r) => r.id === 3)).toHaveLength(1);
  });

  it('(b) loadJobs 增量发 after_id=当前最大 id，loadMoreJobs 发 before_id=cursor 而非 after_id', async () => {
    const { api } = harness({}, { limit: 2 });
    // 全量返回 2 行 → hasMore=true（>=limit），cursor=最后一行 id=5
    apiGet.mockResolvedValueOnce(envelope([9, 5]));
    await api.loadJobs();
    expect(api.hasMore.value).toBe(true);
    expect(api.cursorId.value).toBe(5);

    // 增量：after_id 取「调用时」列表最大 id=9（此刻新行尚未并入），不带 before_id。
    apiGet.mockResolvedValueOnce(envelope([12]));
    await api.loadJobs({ delta: true });
    const deltaQ = lastQuery();
    expect(deltaQ.get('after_id')).toBe('9');
    expect(deltaQ.get('before_id')).toBeNull();

    // 向后翻页：必须发 before_id=cursor，绝不能发 after_id（翻页 bug 的核心断言）。
    const cursorBeforePaging = api.cursorId.value; // 5
    apiGet.mockResolvedValueOnce(envelope([4, 2]));
    await api.loadMoreJobs();
    const moreQ = lastQuery();
    expect(moreQ.get('before_id')).toBe(String(cursorBeforePaging));
    expect(moreQ.get('after_id')).toBeNull();
  });

  it('(c) requestSeq 丢弃被顶替的陈旧响应', async () => {
    const { api } = harness();
    // 第一次全量先坐实一批基础数据，让后续增量真正走 delta 分支。
    apiGet.mockResolvedValueOnce(envelope([1]));
    await api.loadJobs();

    // A：慢响应（手动控制 resolve）；B：随后发起并先返回新数据。
    const gate = Promise.withResolvers<unknown>();
    apiGet.mockReturnValueOnce(gate.promise);
    const pendingA = api.loadJobs({ delta: true, silent: true });

    apiGet.mockResolvedValueOnce(envelope([50, 40], 'running'));
    await api.loadJobs({ delta: true, silent: true });
    expect(api.jobs.value.map((r) => r.id)).toEqual([50, 40, 1]);

    // A 现在才回来，携带过时数据；因 seq 已被 B 顶替，必须被丢弃。
    gate.resolve(envelope([999]));
    await pendingA;
    expect(api.jobs.value.map((r) => r.id)).toEqual([50, 40, 1]);
    expect(api.jobs.value.some((r) => r.id === 999)).toBe(false);
  });

  it('(d) 带 status 过滤时禁用增量，退回全量（不发 after_id）', async () => {
    const { api } = harness({ status: 'running' });
    apiGet.mockResolvedValueOnce(envelope([3, 2], 'running'));
    await api.loadJobs();

    // 即便显式请求 delta，deltaAllowed() 因 status 存在而为假 → 全量，无 after_id。
    apiGet.mockResolvedValueOnce(envelope([3, 2], 'running'));
    await api.loadJobs({ delta: true });
    const q = lastQuery();
    expect(q.get('after_id')).toBeNull();
    expect(q.get('status')).toBe('running');
    expect(api.lastSyncMode.value).toBe('full');
  });

  it('(e) maxRows 截断到上限', async () => {
    const { api } = harness({}, { maxRows: 2 });
    apiGet.mockResolvedValueOnce(envelope([4, 3, 2, 1]));
    await api.loadJobs();
    expect(api.jobs.value.map((r) => r.id)).toEqual([4, 3]);
    expect(api.jobs.value).toHaveLength(2);
  });
});
