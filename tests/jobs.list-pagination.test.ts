import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';

import { listAsyncJobs } from '../functions/api/services/async-jobs';

/**
 * 守住异步任务列表的两个游标语义（listAsyncJobs 的 after_id / before_id）。
 *
 * 回归背景：SystemTaskCenter 的「加载更早任务」一直不工作。前端把列表最小 id 当游标传给
 * after_id，而后端 after_id 是 `id > ?`，返回的恰好是列表里已有的那批行；composable 的
 * applyRows 按 id 去重后长度不变，按钮点下去毫无反应。修复是新增 before_id（`id < ?`）
 * 专用于向后翻页。
 *
 * 这里调用真正的 listAsyncJobs，并把 D1 接口接到 node:sqlite 上真执行它生成的 SQL —— 只
 * 复刻一份 WHERE 构造的话，后端改了构造而复刻没跟着改，测试依然会通过，等于没守住。
 */

/** 把 listAsyncJobs 用到的那部分 D1 接口接到真实 SQLite 上。 */
function sqliteD1(db: DatabaseSync) {
  return {
    prepare(sql: string) {
      const stmt = {
        bind(...params: unknown[]) {
          return {
            async all<T>() {
              return { results: db.prepare(sql).all(...(params as never[])) as T[] };
            },
            async first<T>() {
              return (db.prepare(sql).get(...(params as never[])) ?? null) as T | null;
            },
            async run() {
              db.prepare(sql).run(...(params as never[]));
              return { success: true };
            },
          };
        },
        async all<T>() {
          return { results: db.prepare(sql).all() as T[] };
        },
        async first<T>() {
          return (db.prepare(sql).get() ?? null) as T | null;
        },
        async run() {
          db.prepare(sql).run();
          return { success: true };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

const ROWS = 12;
let raw: DatabaseSync;
let DB: D1Database;

/** 只取 id，断言顺序与集合；skipEnsure 跳过建表探测（表已由 beforeEach 建好）。 */
async function pageIds(options: { limit: number; after_id?: number | null; before_id?: number | null; ids?: number[]; status?: string | null }) {
  const rows = await listAsyncJobs(DB, { ...options, skipEnsure: true });
  return rows.map((row: { id: number }) => Number(row.id));
}

/** composable 里 applyRows 的 append 分支：按 id 去重合并，保留后端顺序。 */
function appendMerge(current: number[], incoming: number[]) {
  const seen = new Set(current);
  return [...current, ...incoming.filter((id) => !seen.has(id))];
}

beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  raw.exec(`
    CREATE TABLE async_jobs (
      id INTEGER PRIMARY KEY,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL,
      created_by INTEGER,
      created_by_name TEXT,
      permission_scope TEXT,
      request_json TEXT,
      message TEXT,
      error_text TEXT,
      result_filename TEXT,
      result_content_type TEXT,
      result_file_size INTEGER,
      result_object_key TEXT,
      result_blob_base64 TEXT,
      result_text TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 1,
      cancel_requested INTEGER DEFAULT 0,
      retain_until TEXT,
      result_deleted_at TEXT,
      canceled_at TEXT
    )
  `);
  const insert = raw.prepare(
    `INSERT INTO async_jobs (id, job_type, status, request_json, created_at) VALUES (?, 'DASHBOARD_PRECOMPUTE', ?, '{}', datetime('now','+8 hours'))`
  );
  // id 12 在跑，其余成功：让 delta 的 ids 分支有真实命中。
  for (let id = 1; id <= ROWS; id++) insert.run(id, id === ROWS ? 'running' : 'success');
  DB = sqliteD1(raw);
});

describe('异步任务列表游标', () => {
  it('首页按 id 倒序返回最新的一批', async () => {
    await expect(pageIds({ limit: 4 })).resolves.toEqual([12, 11, 10, 9]);
  });

  it('before_id 取到更早的任务，且不与首页重叠', async () => {
    const first = await pageIds({ limit: 4 });
    const more = await pageIds({ limit: 4, before_id: first[first.length - 1] });

    expect(more).toEqual([8, 7, 6, 5]);
    expect(more.some((id) => first.includes(id))).toBe(false);
  });

  it('after_id 用于向后翻页会退化成空转 —— 这正是修复前的症状', async () => {
    const first = await pageIds({ limit: 4 });
    const cursor = first[first.length - 1];

    // 错误用法：after_id 是 `id > ?`，命中的全是列表里已有的行，合并后列表长度不变。
    const wrong = await pageIds({ limit: 4, after_id: cursor });
    expect(wrong.every((id) => first.includes(id))).toBe(true);
    expect(appendMerge(first, wrong)).toEqual(first);

    // 正确用法：列表真的变长了。
    const right = await pageIds({ limit: 4, before_id: cursor });
    expect(appendMerge(first, right).length).toBe(first.length + right.length);
  });

  it('连续翻页能走到底并且不丢行、不重复', async () => {
    const size = 5;
    let acc = await pageIds({ limit: size });

    for (let guard = 0; guard < 10; guard++) {
      const next = await pageIds({ limit: size, before_id: acc[acc.length - 1] });
      if (!next.length) break;
      acc = appendMerge(acc, next);
    }

    expect(acc).toEqual(Array.from({ length: ROWS }, (_, i) => ROWS - i));
    expect(new Set(acc).size).toBe(ROWS);
  });

  it('翻到末尾返回空集，hasMore 得以收敛', async () => {
    await expect(pageIds({ limit: 5, before_id: 1 })).resolves.toEqual([]);
  });

  it('before_id 与状态筛选是 AND，不会把筛选外的行捞回来', async () => {
    // status=running 只有 id 12，它不小于 12，所以结果必须为空。
    await expect(pageIds({ limit: 5, status: 'running', before_id: 12 })).resolves.toEqual([]);
    await expect(pageIds({ limit: 5, status: 'running' })).resolves.toEqual([12]);
  });

  it('after_id 与 ids 仍是 OR，增量刷新同时带回新行与在跑的行', async () => {
    // 增量刷新的真实形态：after_id=已知最大 id，ids=在跑任务。
    await expect(pageIds({ limit: 10, after_id: 9, ids: [12] })).resolves.toEqual([12, 11, 10]);
    // ids 命中的行即使不满足 id > after_id 也要返回。
    await expect(pageIds({ limit: 10, after_id: 11, ids: [3] })).resolves.toEqual([12, 3]);
  });

  it('两个游标同时进 WHERE 会得到空区间 —— 端点因此以 after_id 为准', async () => {
    // functions/api/jobs.ts 在 after_id 存在时把 before_id 置空，避免 id > 9 AND id < 5。
    await expect(pageIds({ limit: 10, after_id: 9, before_id: 5 })).resolves.toEqual([]);
    await expect(pageIds({ limit: 10, after_id: 9 })).resolves.toEqual([12, 11, 10]);
  });
});
