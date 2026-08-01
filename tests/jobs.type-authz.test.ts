import type * as AsyncJobsModule from '../functions/api/services/async-jobs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 异步任务通道的授权（CWE-862 / CWE-639）。
 *
 * 两个缺陷：
 *  1. POST /api/jobs 从请求体的 job_type 里挑要校验的权限 —— QR 导出用 qr_export，其余一律
 *     async_job_manage + minRole 'viewer'，而 job_type 没有任何运行时白名单，直接绑进 INSERT。
 *     于是 BACKUP_EXPORT（整库导出，含 users.password_hash）和 AUDIT_ARCHIVE_EXPORT
 *     （可带 delete_after_export 删审计）都能被一个 viewer 创建，而它们的同步孪生接口
 *     （admin/backup.ts、admin/audit/retention.ts、audit/delete.ts）都要求 admin。
 *  2. PUT /api/jobs 的 cancel/retry/delete/delete_batch 把 body.id 直接交给 mutator，
 *     既不查归属也不查数据范围；同一个文件里的 GET 却是按 scope 过滤的。cleanup 更是不带 id
 *     就全库清理任务历史。
 *
 * 这里用真实的 async-job-authz、真实的 assertAsyncJobAccess 和真实的路由处理器，
 * 只把落库副作用与鉴权入口替换掉 —— 复刻一份授权表的话，表改了而复刻没改，测试等于没守住。
 */

const ROLE_LEVEL: Record<string, number> = { viewer: 0, operator: 1, admin: 2 };

/** 当前请求的调用者；每个用例按需改写。 */
let actorFixture: { id: number; username: string; role: string; permissions: Record<string, boolean> };

/** 记录 requirePermission 实际被要求的 (permission, minRole)。 */
let permissionCalls: Array<{ code: string; minRole: string }>;

vi.mock('../functions/_permissions', () => ({
  requirePermission: vi.fn(async (_env: any, _request: any, code: string, minRole = 'viewer') => {
    permissionCalls.push({ code, minRole });
    if (ROLE_LEVEL[actorFixture.role] < ROLE_LEVEL[minRole]) {
      throw Object.assign(new Error('权限不足'), { status: 403 });
    }
    if (!actorFixture.permissions[code]) {
      throw Object.assign(new Error('权限不足'), { status: 403 });
    }
    return actorFixture;
  }),
}));

vi.mock('../functions/api/_audit', () => ({
  logAudit: vi.fn(async () => {}),
}));

vi.mock('../functions/api/services/async-job-queue', () => ({
  dispatchAsyncJobIds: vi.fn(async () => {}),
  isAsyncQueueRequired: vi.fn(() => false),
}));

vi.mock('../functions/api/services/schema-status', () => ({
  getSchemaStatus: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../functions/api/services/data-scope', () => ({
  getAuthUserDataScope: vi.fn((actor: any) => ({ data_scope_type: 'all', role: actor?.role })),
  assertPcAssetIdsDataScopeAccess: vi.fn(async () => {}),
  assertMonitorAssetIdsDataScopeAccess: vi.fn(async () => {}),
  assertAssetInventoryBatchDataScopeAccess: vi.fn(async () => {}),
}));

/** 任务表：id -> 行。副作用函数只记录调用，assertAsyncJobAccess 保持真身。 */
let jobRows: Map<number, { id: number; job_type: string; created_by: number; status?: string }>;
let mutations: string[];

vi.mock('../functions/api/services/async-jobs', async (importOriginal) => {
  const actual = await importOriginal<typeof AsyncJobsModule>();
  return {
    ...actual,
    getAsyncJob: vi.fn(async (_db: any, id: number) => jobRows.get(Number(id)) || null),
    createAsyncJob: vi.fn(async (_db: any, input: any) => {
      mutations.push(`create:${input.job_type}`);
      return 9001;
    }),
    createAsyncJobs: vi.fn(async () => [9002]),
    cancelAsyncJob: vi.fn(async (_db: any, id: number) => {
      mutations.push(`cancel:${id}`);
    }),
    retryAsyncJob: vi.fn(async (_db: any, id: number) => {
      mutations.push(`retry:${id}`);
    }),
    deleteAsyncJob: vi.fn(async (_db: any, id: number) => {
      mutations.push(`delete:${id}`);
    }),
    deleteAsyncJobs: vi.fn(async (_db: any, ids: number[]) => {
      mutations.push(`delete_batch:${ids.join('|')}`);
      return { requested: ids.length, deleted: ids.length, blocked: 0, missing: 0, failed: 0 };
    }),
    cleanupAsyncJobHousekeeping: vi.fn(async () => {
      mutations.push('cleanup');
      return { expired_results: 0, purged_rows: 0, auto_canceled: 0 };
    }),
    listAsyncJobs: vi.fn(async () => []),
  };
});

import { JOB_TYPE_AUTH, resolveAsyncJobAuth } from '../functions/api/services/async-job-authz';
import { assertAsyncJobAccess } from '../functions/api/services/async-jobs';
import { onRequestPost as createJob, onRequestPut as mutateJob } from '../functions/api/jobs';

/** AsyncJobType 的全部 13 个成员，独立写死：漏登记必须让测试失败，而不是跟着源码一起漂。 */
const ALL_JOB_TYPES = [
  'AUDIT_EXPORT',
  'AUDIT_ARCHIVE_EXPORT',
  'BACKUP_EXPORT',
  'PC_AGE_WARNING_EXPORT',
  'DASHBOARD_PRECOMPUTE',
  'OPS_SCAN_REFRESH',
  'PC_QR_KEY_INIT',
  'MONITOR_QR_KEY_INIT',
  'PC_QR_CARDS_EXPORT',
  'PC_QR_SHEET_EXPORT',
  'MONITOR_QR_CARDS_EXPORT',
  'MONITOR_QR_SHEET_EXPORT',
  'ASSET_INVENTORY_BATCH_SNAPSHOT_EXPORT',
] as const;

/** SELECT id, job_type, created_by ... IN (?) 只被 delete_batch 用到。 */
function fakeEnv() {
  return {
    DB: {
      prepare(sql: string) {
        return {
          bind(...ids: unknown[]) {
            return {
              async all() {
                if (!sql.includes('FROM async_jobs')) return { results: [] };
                const results = ids
                  .map((id) => jobRows.get(Number(id)))
                  .filter(Boolean);
                return { results };
              },
              async first() {
                return null;
              },
              async run() {
                return { success: true };
              },
            };
          },
        };
      },
    },
    JWT_SECRET: 'test',
  } as any;
}

function postJob(body: unknown) {
  return createJob({
    env: fakeEnv(),
    request: new Request('https://local/api/jobs', { method: 'POST', body: JSON.stringify(body) }),
    waitUntil: () => {},
  } as any) as Promise<Response>;
}

function putJob(body: unknown) {
  return mutateJob({
    env: fakeEnv(),
    request: new Request('https://local/api/jobs', { method: 'PUT', body: JSON.stringify(body) }),
    waitUntil: () => {},
  } as any) as Promise<Response>;
}

function viewerWith(...codes: string[]) {
  return {
    id: 7,
    username: 'v',
    role: 'viewer',
    permissions: Object.fromEntries(codes.map((code) => [code, true])),
  };
}

beforeEach(() => {
  permissionCalls = [];
  mutations = [];
  jobRows = new Map([
    [1, { id: 1, job_type: 'DASHBOARD_PRECOMPUTE', created_by: 7, status: 'queued' }],
    [2, { id: 2, job_type: 'DASHBOARD_PRECOMPUTE', created_by: 999, status: 'queued' }],
    [3, { id: 3, job_type: 'BACKUP_EXPORT', created_by: 7, status: 'success' }],
  ]);
  actorFixture = viewerWith('async_job_manage');
});

describe('异步任务授权表', () => {
  it('覆盖全部 13 个任务类型，且没有多余条目', () => {
    expect([...Object.keys(JOB_TYPE_AUTH)].sort()).toEqual([...ALL_JOB_TYPES].sort());
  });

  it('特权任务要求 admin', () => {
    expect(JOB_TYPE_AUTH.BACKUP_EXPORT.minRole).toBe('admin');
    expect(JOB_TYPE_AUTH.AUDIT_ARCHIVE_EXPORT.minRole).toBe('admin');
    expect(JOB_TYPE_AUTH.PC_QR_KEY_INIT.minRole).toBe('admin');
    expect(JOB_TYPE_AUTH.MONITOR_QR_KEY_INIT.minRole).toBe('admin');
  });

  it('只读审计导出仍然是 viewer + audit_export', () => {
    expect(JOB_TYPE_AUTH.AUDIT_EXPORT).toEqual({ permission: 'audit_export', minRole: 'viewer' });
  });

  it('未登记的类型返回 null', () => {
    expect(resolveAsyncJobAuth('NOPE')).toBeNull();
    expect(resolveAsyncJobAuth('')).toBeNull();
  });

  it('原型链上的键不算已登记类型', () => {
    // 用 hasOwnProperty 而不是 in / 真值判断，否则 'constructor' 会拿到一个函数。
    expect(resolveAsyncJobAuth('constructor')).toBeNull();
    expect(resolveAsyncJobAuth('__proto__')).toBeNull();
    expect(resolveAsyncJobAuth('toString')).toBeNull();
  });
});

describe('POST /api/jobs 按类型授权', () => {
  it('未知 job_type 返回 400 且不建任务', async () => {
    const res = await postJob({ job_type: 'DROP_EVERYTHING' });

    expect(res.status).toBe(400);
    expect(mutations).toEqual([]);
    // 白名单必须先于鉴权与建库：连 requirePermission 都不该走到。
    expect(permissionCalls).toEqual([]);
  });

  it('缺失 job_type 返回 400', async () => {
    const res = await postJob({});
    expect(res.status).toBe(400);
    expect(mutations).toEqual([]);
  });

  it('请求体不是合法 JSON 时返回 400 而不是 500', async () => {
    const res = (await createJob({
      env: fakeEnv(),
      request: new Request('https://local/api/jobs', { method: 'POST', body: '{oops' }),
      waitUntil: () => {},
    } as any)) as Response;

    expect(res.status).toBe(400);
  });

  it('持有 async_job_manage 的 viewer 不能创建 BACKUP_EXPORT', async () => {
    const res = await postJob({ job_type: 'BACKUP_EXPORT', request_json: {} });

    expect(res.status).toBe(403);
    expect(mutations).toEqual([]);
    expect(permissionCalls).toEqual([{ code: 'async_job_manage', minRole: 'admin' }]);
  });

  it('持有 audit_export 的 viewer 不能创建 AUDIT_ARCHIVE_EXPORT', async () => {
    actorFixture = viewerWith('audit_export', 'async_job_manage');
    const res = await postJob({
      job_type: 'AUDIT_ARCHIVE_EXPORT',
      request_json: { archive_before: '2099-01-01', max_rows: 50000, delete_after_export: true },
    });

    expect(res.status).toBe(403);
    expect(mutations).toEqual([]);
    expect(permissionCalls).toEqual([{ code: 'audit_export', minRole: 'admin' }]);
  });

  it('admin 可以创建 BACKUP_EXPORT', async () => {
    actorFixture = { id: 1, username: 'a', role: 'admin', permissions: { async_job_manage: true } };
    const res = await postJob({ job_type: 'BACKUP_EXPORT', request_json: {} });

    expect(res.status).toBe(200);
    expect(mutations).toEqual(['create:BACKUP_EXPORT']);
  });

  it('viewer + audit_export 仍可创建只读的 AUDIT_EXPORT', async () => {
    actorFixture = viewerWith('audit_export');
    const res = await postJob({ job_type: 'AUDIT_EXPORT', request_json: {} });

    expect(res.status).toBe(200);
    expect(mutations).toEqual(['create:AUDIT_EXPORT']);
  });

  it('只有 async_job_manage 的 viewer 不能借 AUDIT_EXPORT 绕过 audit_export', async () => {
    const res = await postJob({ job_type: 'AUDIT_EXPORT', request_json: {} });

    expect(res.status).toBe(403);
    expect(permissionCalls).toEqual([{ code: 'audit_export', minRole: 'viewer' }]);
  });

  it('OPS_SCAN_REFRESH 要求 ops_tools 而不是 async_job_manage', async () => {
    const res = await postJob({ job_type: 'OPS_SCAN_REFRESH' });

    expect(res.status).toBe(403);
    expect(permissionCalls).toEqual([{ code: 'ops_tools', minRole: 'viewer' }]);
  });
});

describe('assertAsyncJobAccess', () => {
  const db = {} as D1Database;

  it('非本人非 admin 一律 403', async () => {
    await expect(
      assertAsyncJobAccess(db, jobRows.get(2), { id: 7, role: 'viewer' }, null)
    ).rejects.toMatchObject({ status: 403 });
  });

  it('本人可以访问自己的普通任务', async () => {
    await expect(
      assertAsyncJobAccess(db, jobRows.get(1), { id: 7, role: 'viewer' }, null)
    ).resolves.toBeUndefined();
  });

  it('admin 可以访问他人任务', async () => {
    await expect(
      assertAsyncJobAccess(db, jobRows.get(2), { id: 1, role: 'admin' }, null)
    ).resolves.toBeUndefined();
  });

  it('整库备份的结果即使是本人创建也仅限 admin', async () => {
    // 创建者身份不足以放行一份含 password_hash 的整库导出。
    await expect(
      assertAsyncJobAccess(db, jobRows.get(3), { id: 7, role: 'viewer' }, null)
    ).rejects.toMatchObject({ status: 403 });
  });

  it('审计归档导出同样仅限 admin', async () => {
    await expect(
      assertAsyncJobAccess(db, { id: 4, job_type: 'AUDIT_ARCHIVE_EXPORT', created_by: 7 }, { id: 7, role: 'viewer' }, null)
    ).rejects.toMatchObject({ status: 403 });
  });

  it('admin 可以访问整库备份结果', async () => {
    await expect(
      assertAsyncJobAccess(db, jobRows.get(3), { id: 1, role: 'admin' }, null)
    ).resolves.toBeUndefined();
  });
});

describe('PUT /api/jobs 变更操作的归属校验', () => {
  it('cancel 他人任务返回 403 且不执行', async () => {
    const res = await putJob({ action: 'cancel', id: 2 });

    expect(res.status).toBe(403);
    expect(mutations).toEqual([]);
  });

  it('retry 他人任务返回 403 且不执行', async () => {
    const res = await putJob({ action: 'retry', id: 2 });

    expect(res.status).toBe(403);
    expect(mutations).toEqual([]);
  });

  it('delete 他人任务返回 403 且不执行', async () => {
    const res = await putJob({ action: 'delete', id: 2 });

    expect(res.status).toBe(403);
    expect(mutations).toEqual([]);
  });

  it('cancel 自己的任务仍然可用', async () => {
    const res = await putJob({ action: 'cancel', id: 1 });

    expect(res.status).toBe(200);
    expect(mutations).toEqual(['cancel:1']);
  });

  it('不存在的任务返回 404', async () => {
    const res = await putJob({ action: 'cancel', id: 4242 });

    expect(res.status).toBe(404);
    expect(mutations).toEqual([]);
  });

  it('delete_batch 混入他人 id 时整批 403,不静默跳过', async () => {
    const res = await putJob({ action: 'delete_batch', ids: [1, 2] });

    expect(res.status).toBe(403);
    expect(mutations).toEqual([]);
  });

  it('delete_batch 全是自己的 id 时正常执行', async () => {
    const res = await putJob({ action: 'delete_batch', ids: [1] });

    expect(res.status).toBe(200);
    expect(mutations).toEqual(['delete_batch:1']);
  });

  it('cleanup 要求 admin', async () => {
    const res = await putJob({ action: 'cleanup' });

    expect(res.status).toBe(403);
    expect(mutations).toEqual([]);
    expect(permissionCalls).toEqual([
      { code: 'async_job_manage', minRole: 'viewer' },
      { code: 'async_job_manage', minRole: 'admin' },
    ]);
  });

  it('admin 可以执行 cleanup', async () => {
    actorFixture = { id: 1, username: 'a', role: 'admin', permissions: { async_job_manage: true } };
    const res = await putJob({ action: 'cleanup' });

    expect(res.status).toBe(200);
    expect(mutations).toEqual(['cleanup']);
  });
});
