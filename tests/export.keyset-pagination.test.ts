import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildAuditExportCsvResult } from '../functions/api/services/async-jobs';
import { listAuditRows, parseAuditListFilters } from '../functions/api/services/audit-log';
import { listPcAssets, type QueryParts } from '../functions/api/services/asset-ledger';

/**
 * 导出路径的 keyset 分页（替换递增 OFFSET）。
 *
 * 背景：审计 CSV 流式导出与 PC 台账导出都是「顺序走完整个结果集」，却用递增 OFFSET 翻页。
 * SQLite 的 OFFSET 不是跳过，是产出后丢弃：第 N 页要重新产出前 N-1 页的全部行。
 * 20 万行 / 每页 1000 行 ≈ 2010 万次行产出，而 keyset 只需 20 万次。
 *
 * 同时 getAuditOrderBy 过去只按单列排序，created_at 重复时翻页边界不确定 —— 既是既有缺陷，
 * 也让游标无法定位，因此补了 a.id 决胜列。
 *
 * 这里让真实的 listAuditRows / listPcAssets / buildAuditExportCsvResult 在 node:sqlite 上
 * 真正执行它们生成的 SQL：只复刻 WHERE/LIMIT 构造的话，源码改了而复刻没改，测试就守不住。
 */

/** 记录每次 prepare 的 SQL，用来断言翻页后不再出现 OFFSET。 */
let sqlLog: string[];

function sqliteD1(db: DatabaseSync) {
  return {
    prepare(sql: string) {
      sqlLog.push(sql);
      return {
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
    },
  } as unknown as D1Database;
}

/** 页大小是 1000，要跨 3 个页边界就得有 2500 行以上。 */
const AUDIT_ROWS = 2500;
/** 每 7 行共用一个 created_at：制造重复排序键，逼出决胜列的必要性。 */
const DUP_GROUP = 7;

let raw: DatabaseSync;
let DB: D1Database;

beforeEach(() => {
  sqlLog = [];
  raw = new DatabaseSync(':memory:');
  raw.exec(`
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      action TEXT,
      entity TEXT,
      entity_id TEXT,
      ip TEXT,
      ua TEXT,
      payload_json TEXT,
      target_name TEXT,
      target_code TEXT,
      summary_text TEXT,
      search_text_norm TEXT,
      module_code TEXT,
      high_risk INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE stock_tx (tx_no TEXT, item_id INTEGER);
    CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT);
    CREATE TABLE pc_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT, model TEXT, serial_no TEXT, status TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      inventory_status TEXT NOT NULL DEFAULT 'UNCHECKED'
    );
    CREATE TABLE pc_asset_latest_state (
      asset_id INTEGER PRIMARY KEY,
      current_employee_no TEXT, current_employee_name TEXT, current_department TEXT,
      last_config_date TEXT, last_recycle_date TEXT, last_out_at TEXT, last_in_at TEXT
    );
    CREATE TABLE pc_out (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER, employee_no TEXT, employee_name TEXT, department TEXT,
      config_date TEXT, created_at TEXT
    );
  `);

  const insertAudit = raw.prepare(
    `INSERT INTO audit_log (id, username, action, entity, entity_id, module_code, high_risk, created_at)
     VALUES (?, ?, 'UPDATE', 'items', ?, ?, ?, ?)`
  );
  for (let id = 1; id <= AUDIT_ROWS; id++) {
    // created_at 每 DUP_GROUP 行重复一次；模块交替回填/未回填，覆盖 sargable 谓词两个分支。
    const bucket = Math.floor((id - 1) / DUP_GROUP);
    const createdAt = `2026-01-01 00:${String(bucket % 60).padStart(2, '0')}:00`;
    insertAudit.run(id, `u${id % 5}`, String(id), id % 2 === 0 ? 'STOCK' : null, id % 10 === 0 ? 1 : 0, createdAt);
  }

  const insertAsset = raw.prepare(
    `INSERT INTO pc_assets (id, brand, model, serial_no, status) VALUES (?, 'B', 'M', ?, 'IN_STOCK')`
  );
  for (let id = 1; id <= 450; id++) insertAsset.run(id, `SN${id}`);

  DB = sqliteD1(raw);
});

/** 顺序走完全表：keyset 游标推进。返回按发出顺序拼接的 id。 */
async function keysetWalk(sortBy: 'id' | 'created_at', sortDir: 'ASC' | 'DESC', pageSize: number) {
  const url = new URL(`https://local/x?sort_by=${sortBy}&sort_dir=${sortDir.toLowerCase()}`);
  const filters = parseAuditListFilters(url);
  const ids: number[] = [];
  let cursor: { id: number; created_at: string } | null = null;
  for (let guard = 0; guard < 100; guard++) {
    const rows = await listAuditRows(DB, filters, cursor ? { limit: pageSize, after: cursor } : { limit: pageSize, offset: 0 });
    if (!rows.length) break;
    for (const row of rows) ids.push(Number(row.id));
    const last = rows[rows.length - 1];
    cursor = { id: Number(last.id), created_at: String(last.created_at) };
    if (rows.length < pageSize) break;
  }
  return ids;
}

/** 同一顺序的 OFFSET 走法，作为等价性基准。 */
async function offsetWalk(sortBy: 'id' | 'created_at', sortDir: 'ASC' | 'DESC', pageSize: number) {
  const url = new URL(`https://local/x?sort_by=${sortBy}&sort_dir=${sortDir.toLowerCase()}`);
  const filters = parseAuditListFilters(url);
  const ids: number[] = [];
  for (let offset = 0; offset < AUDIT_ROWS + pageSize; offset += pageSize) {
    const rows = await listAuditRows(DB, filters, { limit: pageSize, offset });
    if (!rows.length) break;
    for (const row of rows) ids.push(Number(row.id));
    if (rows.length < pageSize) break;
  }
  return ids;
}

describe('审计导出 keyset 分页', () => {
  it('按 id 降序走完全表：每行恰好一次，无重复无缺口', async () => {
    const ids = await keysetWalk('id', 'DESC', 800);

    expect(ids).toHaveLength(AUDIT_ROWS);
    expect(new Set(ids).size).toBe(AUDIT_ROWS);
    expect(ids[0]).toBe(AUDIT_ROWS);
    expect(ids[ids.length - 1]).toBe(1);
  });

  it('按 created_at 降序（大量重复时间戳）跨 3 个以上页边界仍然每行恰好一次', async () => {
    // 每 7 行共用一个 created_at：没有 a.id 决胜列的话，游标在这里必然漏行或重复。
    const ids = await keysetWalk('created_at', 'DESC', 800);

    expect(ids).toHaveLength(AUDIT_ROWS);
    expect(new Set(ids).size).toBe(AUDIT_ROWS);
  });

  it('按 created_at 升序同样完整', async () => {
    const ids = await keysetWalk('created_at', 'ASC', 700);

    expect(ids).toHaveLength(AUDIT_ROWS);
    expect(new Set(ids).size).toBe(AUDIT_ROWS);
  });

  it('keyset 与 OFFSET 走法产出完全相同的顺序', async () => {
    const viaKeyset = await keysetWalk('created_at', 'DESC', 800);
    const viaOffset = await offsetWalk('created_at', 'DESC', 800);

    expect(viaKeyset).toEqual(viaOffset);
  });

  it('排序在重复 created_at 上是全序：重复两次查询结果一致', async () => {
    const first = await keysetWalk('created_at', 'DESC', 400);
    const second = await keysetWalk('created_at', 'DESC', 400);

    expect(first).toEqual(second);
  });

  it('翻页后不再出现 OFFSET,改用 id 游标', async () => {
    sqlLog = [];
    await keysetWalk('id', 'DESC', 800);
    const pageSql = sqlLog.filter((sql) => sql.includes('FROM audit_log'));

    expect(pageSql.length).toBeGreaterThan(3);
    expect(pageSql[0]).toContain('OFFSET');
    for (const sql of pageSql.slice(1)) {
      expect(sql).not.toContain('OFFSET');
      expect(sql).toContain('a.id <');
    }
  });

  it('created_at 游标使用 (时间 < ? OR (时间 = ? AND id < ?)) 而不是行值语法', async () => {
    sqlLog = [];
    await keysetWalk('created_at', 'DESC', 800);
    const cursorSql = sqlLog.filter((sql) => sql.includes('FROM audit_log') && !sql.includes('OFFSET'));

    expect(cursorSql.length).toBeGreaterThan(0);
    expect(cursorSql[0]).toContain('a.created_at < ? OR (a.created_at = ? AND a.id < ?)');
  });
});

describe('审计模块筛选的可命中索引形态', () => {
  it('模块筛选直接绑 a.module_code,已回填的行不再被 CASE 包住', async () => {
    sqlLog = [];
    const filters = parseAuditListFilters(new URL('https://local/x?module=STOCK'));
    const rows = await listAuditRows(DB, filters, { limit: 50, offset: 0 });

    const pageSql = sqlLog.find((sql) => sql.includes('FROM audit_log')) || '';
    expect(pageSql).toContain('a.module_code = ?');
    // 回填过的行（偶数 id）全部命中。
    expect(rows.length).toBe(50);
    for (const row of rows) expect(Number(row.id) % 2).toBe(0);
  });

  it('高危筛选是裸的 a.high_risk = 1', async () => {
    sqlLog = [];
    const filters = parseAuditListFilters(new URL('https://local/x?high_risk=1'));
    const rows = await listAuditRows(DB, filters, { limit: 30, offset: 0 });

    const pageSql = sqlLog.find((sql) => sql.includes('FROM audit_log')) || '';
    expect(pageSql).toContain('a.high_risk = 1');
    // 投影里的 COALESCE(a.high_risk, ...) 是有意保留的（high_risk 用于展示回退）；
    // 这里只要求 WHERE 谓词是裸列，索引才用得上。
    expect(pageSql).toContain('WHERE a.high_risk = 1');
    for (const row of rows) expect(Number(row.id) % 10).toBe(0);
  });
});

describe('审计 CSV 流式导出', () => {
  it('流式导出发出全部数据行,恰好一次', async () => {
    // bucket 只需真值即可进入流式分支。
    const result = await buildAuditExportCsvResult(DB, { scope: 'all' }, {} as never);
    expect(result.stream).toBeTruthy();

    const reader = (result.stream as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }

    const lines = text.split('\n').filter((line) => line.trim().length > 0);
    // 首行是带 BOM 的表头。
    expect(lines[0]).toContain('时间');
    expect(lines).toHaveLength(AUDIT_ROWS + 1);
  });

  it('scope=current 带非零 offset 时第一页仍从正确位置开始', async () => {
    const result = await buildAuditExportCsvResult(
      DB,
      { scope: 'current', page: 2, page_size: 20 },
      {} as never
    );
    const reader = (result.stream as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }

    const lines = text.split('\n').filter((line) => line.trim().length > 0);
    // 第 2 页 20 行：跳过 id 2500..2481，从 2480 开始。
    expect(lines).toHaveLength(21);
    expect(lines[1]).toContain('2480');
  });
});

describe('PC 台账导出的 keyset 页窗口', () => {
  function baseQuery(pageSize: number, extra: Partial<QueryParts> = {}): QueryParts {
    return {
      where: 'WHERE a.archived=0',
      binds: [],
      page: 1,
      pageSize,
      offset: 0,
      fast: false,
      joins: '',
      usesFts: false,
      ...extra,
    };
  }

  /** listPcAssets 返回 unknown 形状的行；这里显式校验 id 再读，避免凭空断言。 */
  function rowId(row: unknown): number {
    if (!row || typeof row !== 'object' || !('id' in row)) throw new Error('行缺少 id');
    return Number(row.id);
  }

  it('afterId 走完全表,与 OFFSET 走法顺序一致', async () => {
    const chunk = 200;
    const viaKeyset: number[] = [];
    let afterId = 0;
    for (let guard = 0; guard < 20; guard++) {
      const rows = await listPcAssets(DB, baseQuery(chunk, { afterId }));
      if (!rows.length) break;
      for (const row of rows) viaKeyset.push(rowId(row));
      afterId = rowId(rows[rows.length - 1]);
      if (rows.length < chunk) break;
    }

    const viaOffset: number[] = [];
    for (let offset = 0; offset < 600; offset += chunk) {
      const rows = await listPcAssets(DB, baseQuery(chunk, { offset }));
      if (!rows.length) break;
      for (const row of rows) viaOffset.push(rowId(row));
      if (rows.length < chunk) break;
    }

    expect(viaKeyset).toHaveLength(450);
    expect(new Set(viaKeyset).size).toBe(450);
    expect(viaKeyset).toEqual(viaOffset);
  });

  it('带 afterId 的页窗口不含 OFFSET', async () => {
    sqlLog = [];
    await listPcAssets(DB, baseQuery(100, { afterId: 42 }));
    const pageSql = sqlLog.find((sql) => sql.includes('FROM pc_assets')) || '';

    expect(pageSql).toContain('a.id > ?');
    expect(pageSql).not.toContain('OFFSET');
  });

  it('不带 afterId 时保持原有 OFFSET 行为', async () => {
    sqlLog = [];
    await listPcAssets(DB, baseQuery(100, { offset: 100 }));
    const pageSql = sqlLog.find((sql) => sql.includes('FROM pc_assets')) || '';

    expect(pageSql).toContain('LIMIT ? OFFSET ?');
    expect(pageSql).not.toContain('a.id > ?');
  });

  it('fast 分支同样支持 keyset', async () => {
    sqlLog = [];
    const rows = await listPcAssets(DB, baseQuery(50, { afterId: 400, fast: true }));
    const pageSql = sqlLog.find((sql) => sql.includes('FROM pc_assets')) || '';

    expect(pageSql).toContain('a.id > ?');
    expect(pageSql).not.toContain('OFFSET');
    expect(rows).toHaveLength(50);
    expect(rowId(rows[0])).toBe(401);
  });
});
