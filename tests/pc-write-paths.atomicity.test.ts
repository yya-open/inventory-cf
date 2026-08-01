import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';

import { GuardRollbackError } from '../functions/api/_write';
import { bulkUpdatePcOwner, bulkUpdatePcStatus } from '../functions/api/services/asset-bulk';
import { applyPcOut, applyPcRecycle, applyPcScrap } from '../functions/api/services/asset-write';
import { recalcPcAssetStatuses } from '../functions/api/pc-tx/_recalc';

/**
 * 写路径的原子性与并发前置条件（第二批修复）。
 *
 * 这些测试跑在真实 SQLite 上，且 batch() 用真事务包裹 —— 语句报错就整批 ROLLBACK。
 * 这一点是必须的：本轮修的全是「提交了一半」和「状态与台账不一致」，而这两类缺陷
 * 在「把 batch 当成 for 循环逐条执行」的假 shim 下根本不可能复现。
 *
 * 核心不变式（pc-tx/_recalc.ts 定义）：
 *   pc_assets.status 是「最新一条 pc_in/pc_out/pc_recycle/pc_scrap 事件」的纯函数。
 * 因此每个测试的收尾断言都是：**再跑一次 recalc，状态不许变**。
 * 状态在重算后发生漂移，就意味着写路径留下了台账无法解释的状态 —— 这正是 F3 的形态，
 * 而且因为恢复流程会重算每一行，那种状态是不持久的，管理员的操作会静默消失。
 */

/** 逐条执行，SELECT 需要 materialize 才能让守卫的报错真的抛出来。 */
function exec(raw: DatabaseSync, sql: string, binds: unknown[] = []) {
  const stmt = raw.prepare(sql);
  return /^\s*SELECT/i.test(sql) ? stmt.all(...(binds as never[])) : stmt.run(...(binds as never[]));
}

/**
 * D1 替身：一个 batch = 一个事务。
 * 同时记录每个批次里的 SQL，用来断言「台账 + 状态 + 派生表在同一个事务里」——
 * 只数批次总数是不够的，因为 syncSystemDictionaryUsageCounters 等旁路也会发批次。
 */
function fakeD1(raw: DatabaseSync) {
  const state = { batches: 0, statements: 0, sqlByBatch: [] as string[][] };
  const api = {
    prepare(sql: string) {
      const binds: unknown[] = [];
      const stmt = {
        sql,
        binds,
        bind(...args: unknown[]) {
          binds.push(...args);
          return stmt;
        },
        async all() {
          return { results: exec(raw, sql, binds) };
        },
        async first() {
          const rows = exec(raw, sql, binds) as unknown[];
          return (Array.isArray(rows) ? rows[0] : rows) ?? null;
        },
        async run() {
          exec(raw, sql, binds);
          return { success: true };
        },
      };
      return stmt;
    },
    async batch(stmts: { sql: string; binds: unknown[] }[]) {
      state.batches += 1;
      state.statements += stmts.length;
      state.sqlByBatch.push(stmts.map((s) => s.sql));
      raw.exec('BEGIN');
      try {
        const results = stmts.map((s) => ({ success: true, results: exec(raw, s.sql, s.binds) }));
        raw.exec('COMMIT');
        return results;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { db: api as unknown as D1Database, state };
}

let raw: DatabaseSync;
let DB: D1Database;
let state: { batches: number; statements: number; sqlByBatch: string[][] };

/** 找出同时包含这些片段的那个批次；找不到返回 -1。 */
function batchContainingAll(...fragments: string[]) {
  return state.sqlByBatch.findIndex((sqls) =>
    fragments.every((fragment) => sqls.some((sql) => sql.includes(fragment)))
  );
}

/** status / 领用人 / 派生表当前值，断言用。 */
function assetState(id: number) {
  const asset = raw.prepare(`SELECT status FROM pc_assets WHERE id=?`).get(id) as { status?: string } | undefined;
  const latest = raw
    .prepare(`SELECT current_employee_no, current_employee_name, current_department FROM pc_asset_latest_state WHERE asset_id=?`)
    .get(id) as Record<string, unknown> | undefined;
  return {
    status: String(asset?.status ?? ''),
    employeeNo: (latest?.current_employee_no ?? null) as string | null,
    employeeName: (latest?.current_employee_name ?? null) as string | null,
    department: (latest?.current_department ?? null) as string | null,
  };
}

function countRows(table: string, assetId: number) {
  const row = raw.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE asset_id=?`).get(assetId) as { c?: number };
  return Number(row?.c ?? 0);
}

beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  raw.exec(`
    CREATE TABLE pc_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT, serial_no TEXT UNIQUE, model TEXT,
      manufacture_date TEXT, warranty_end TEXT, disk_capacity TEXT, memory_size TEXT, remark TEXT,
      status TEXT NOT NULL DEFAULT 'IN_STOCK',
      archived INTEGER NOT NULL DEFAULT 0,
      inventory_status TEXT NOT NULL DEFAULT 'UNCHECKED',
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE pc_in (
      id INTEGER PRIMARY KEY AUTOINCREMENT, in_no TEXT UNIQUE, asset_id INTEGER,
      brand TEXT, serial_no TEXT, model TEXT,
      manufacture_date TEXT, warranty_end TEXT, disk_capacity TEXT, memory_size TEXT, remark TEXT,
      created_at TEXT, created_by TEXT
    );
    CREATE TABLE pc_out (
      id INTEGER PRIMARY KEY AUTOINCREMENT, out_no TEXT UNIQUE, asset_id INTEGER,
      employee_no TEXT, department TEXT, employee_name TEXT, is_employed TEXT,
      brand TEXT, serial_no TEXT, model TEXT,
      config_date TEXT, manufacture_date TEXT, warranty_end TEXT, disk_capacity TEXT, memory_size TEXT,
      remark TEXT, recycle_date TEXT, created_at TEXT, created_by TEXT
    );
    CREATE TABLE pc_recycle (
      id INTEGER PRIMARY KEY AUTOINCREMENT, recycle_no TEXT UNIQUE,
      action TEXT NOT NULL CHECK(action IN ('RETURN','RECYCLE')), asset_id INTEGER,
      employee_no TEXT, department TEXT, employee_name TEXT, is_employed TEXT,
      brand TEXT, serial_no TEXT, model TEXT,
      recycle_date TEXT, remark TEXT, created_at TEXT, created_by TEXT
    );
    CREATE TABLE pc_scrap (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scrap_no TEXT, asset_id INTEGER,
      brand TEXT, serial_no TEXT, model TEXT,
      manufacture_date TEXT, warranty_end TEXT, disk_capacity TEXT, memory_size TEXT, remark TEXT,
      scrap_date TEXT NOT NULL, reason TEXT, created_at TEXT, created_by TEXT
    );
    CREATE TABLE pc_asset_latest_state (
      asset_id INTEGER PRIMARY KEY,
      last_out_id INTEGER, last_in_id INTEGER, last_recycle_id INTEGER,
      current_employee_no TEXT, current_employee_name TEXT, current_department TEXT,
      last_config_date TEXT, last_out_at TEXT, last_in_at TEXT, last_recycle_date TEXT,
      updated_at TEXT
    );
    CREATE TABLE system_dictionary_items (id INTEGER PRIMARY KEY, dictionary_key TEXT, value TEXT, usage_count INTEGER);
    CREATE TABLE dictionary_usage_dirty_keys (
      dictionary_key TEXT PRIMARY KEY,
      dirty_since TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
      refresh_after TEXT, attempt_count INTEGER, last_error TEXT
    );
  `);
  const ins = raw.prepare(`INSERT INTO pc_assets (id, brand, serial_no, model, status) VALUES (?, 'B', ?, 'M', ?)`);
  for (let id = 1; id <= 40; id++) ins.run(id, `SN${id}`, 'IN_STOCK');
  const fake = fakeD1(raw);
  DB = fake.db;
  state = fake.state;
});

/** 让资产处于「已领用」：写一条 pc_out 并重算。 */
async function makeAssigned(assetId: number, employeeNo = 'E1', employeeName = '张三', department = '研发部') {
  raw.prepare(
    `INSERT INTO pc_out (out_no, asset_id, employee_no, department, employee_name, brand, serial_no, model, created_at)
     VALUES (?,?,?,?,?, 'B', ?, 'M', datetime('now','+8 hours'))`
  ).run(`OUT-${assetId}`, assetId, employeeNo, department, employeeName, `SN${assetId}`);
  await recalcPcAssetStatuses(DB, [assetId]);
}

describe('F3 批量改状态必须写台账事件', () => {
  it('IN_STOCK 落一条 pc_recycle(RETURN)，且状态经重算后不变', async () => {
    await makeAssigned(1);
    await bulkUpdatePcStatus(DB, [1], 'IN_STOCK', { createdBy: 'admin' });

    expect(countRows('pc_recycle', 1)).toBe(1);
    const action = raw.prepare(`SELECT action FROM pc_recycle WHERE asset_id=1`).get() as { action?: string };
    expect(action?.action).toBe('RETURN');
    expect(assetState(1).status).toBe('IN_STOCK');

    // 关键断言：重算不许改变状态。旧实现只发 UPDATE、不写事件，这里会被推回 ASSIGNED。
    await recalcPcAssetStatuses(DB, [1]);
    expect(assetState(1).status).toBe('IN_STOCK');
  });

  it('RECYCLED 落一条 pc_recycle(RECYCLE)，且状态经重算后不变', async () => {
    await makeAssigned(2);
    await bulkUpdatePcStatus(DB, [2], 'RECYCLED', { createdBy: 'admin' });

    const action = raw.prepare(`SELECT action FROM pc_recycle WHERE asset_id=2`).get() as { action?: string };
    expect(action?.action).toBe('RECYCLE');
    expect(assetState(2).status).toBe('RECYCLED');

    await recalcPcAssetStatuses(DB, [2]);
    expect(assetState(2).status).toBe('RECYCLED');
  });

  it('SCRAPPED 落一条 pc_scrap，且状态经重算后不变', async () => {
    await makeAssigned(3);
    await bulkUpdatePcStatus(DB, [3], 'SCRAPPED', { createdBy: 'admin' });

    expect(countRows('pc_scrap', 3)).toBe(1);
    expect(assetState(3).status).toBe('SCRAPPED');

    await recalcPcAssetStatuses(DB, [3]);
    expect(assetState(3).status).toBe('SCRAPPED');
  });

  it('回收后清空派生表里的领用人（由重建 SQL 的 CASE 负责）', async () => {
    await makeAssigned(4, 'E9', '李四', '销售部');
    expect(assetState(4).employeeNo).toBe('E9');

    await bulkUpdatePcStatus(DB, [4], 'RECYCLED', { createdBy: 'admin' });
    const after = assetState(4);
    expect(after.employeeNo).toBeNull();
    expect(after.employeeName).toBeNull();
    expect(after.department).toBeNull();
  });

  it('回收事件快照保留原领用人，便于追溯', async () => {
    await makeAssigned(5, 'E7', '王五', '财务部');
    await bulkUpdatePcStatus(DB, [5], 'RECYCLED', { createdBy: 'admin' });

    const row = raw.prepare(`SELECT employee_no, employee_name, department FROM pc_recycle WHERE asset_id=5`).get() as Record<string, unknown>;
    expect(row.employee_no).toBe('E7');
    expect(row.employee_name).toBe('王五');
    expect(row.department).toBe('财务部');
  });

  it('34 项以上只用一个批次，不再按 100 条语句切批', async () => {
    const ids = Array.from({ length: 40 }, (_, i) => i + 1);
    for (const id of ids) await makeAssigned(id);
    state.sqlByBatch = [];

    await bulkUpdatePcStatus(DB, ids, 'RECYCLED', { createdBy: 'admin' });

    // 事件、状态重算、派生表重建必须同批：旧实现按 100 条语句切批，34 项以上必然撕裂
    expect(batchContainingAll('INSERT INTO pc_recycle', 'UPDATE pc_assets', 'INSERT INTO pc_asset_latest_state')).toBe(0);
    for (const id of ids) expect(assetState(id).status).toBe('RECYCLED');
  });

  it('不支持的目标状态直接抛 400，不写任何东西', async () => {
    await makeAssigned(6);
    await expect(bulkUpdatePcStatus(DB, [6], 'ASSIGNED', { createdBy: 'admin' })).rejects.toMatchObject({ status: 400 });
    expect(countRows('pc_recycle', 6)).toBe(0);
    expect(assetState(6).status).toBe('ASSIGNED');
  });

  it('没有命中任何资产时不发批次', async () => {
    state.sqlByBatch = [];
    const result = await bulkUpdatePcStatus(DB, [9999], 'RECYCLED', { createdBy: 'admin' });
    expect(result.changed).toBe(0);
    expect(state.sqlByBatch).toHaveLength(0);
  });

  it('同一秒内补写的事件必须严格晚于既有事件（跨表 rid 无法定序）', async () => {
    // recalc 按 `created_at DESC, rid DESC` 取最新事件，但 rid 是每张表各自的自增主键，
    // 跨表比较 pc_out.id 与 pc_recycle.id 毫无意义。同秒时二级键定不了序，
    // SQLite 返回哪条是任意的。补写方必须把自己的时间推到 max(now, 最新事件+1s)。
    await makeAssigned(15);
    const outAt = (raw.prepare(`SELECT created_at FROM pc_out WHERE asset_id=15`).get() as { created_at: string }).created_at;

    await bulkUpdatePcStatus(DB, [15], 'RECYCLED', { createdBy: 'admin' });

    const recAt = (raw.prepare(`SELECT created_at FROM pc_recycle WHERE asset_id=15`).get() as { created_at: string }).created_at;
    expect(recAt > outAt).toBe(true);

    // 严格晚于 => 重算稳定收敛到补写的那条事件
    await recalcPcAssetStatuses(DB, [15]);
    expect(assetState(15).status).toBe('RECYCLED');
  });
});

describe('F2 批量改领用人必须原子', () => {
  it('一个批次内完成 pc_out + 状态 + 派生表', async () => {
    await makeAssigned(7, 'E1', '张三', '研发部');
    state.sqlByBatch = [];

    await bulkUpdatePcOwner(DB, [7], { employee_no: 'E2', department: '市场部', employee_name: '赵六' }, { createdBy: 'admin' });

    expect(batchContainingAll('INSERT INTO pc_out', 'UPDATE pc_assets', 'INSERT INTO pc_asset_latest_state')).toBe(0);
    const after = assetState(7);
    expect(after.status).toBe('ASSIGNED');
    expect(after.employeeNo).toBe('E2');
    expect(after.employeeName).toBe('赵六');
    expect(after.department).toBe('市场部');
  });

  it('改完领用人后重算，状态与领用人都不漂移', async () => {
    await makeAssigned(8, 'E1', '张三', '研发部');
    await bulkUpdatePcOwner(DB, [8], { employee_no: 'E2', department: '市场部', employee_name: '赵六' }, { createdBy: 'admin' });

    await recalcPcAssetStatuses(DB, [8]);
    const after = assetState(8);
    expect(after.status).toBe('ASSIGNED');
    expect(after.employeeNo).toBe('E2');
    expect(after.department).toBe('市场部');
  });

  it('领用人没有变化时不发事件，避免写放大', async () => {
    await makeAssigned(9, 'E1', '张三', '研发部');
    const before = countRows('pc_out', 9);

    const result = await bulkUpdatePcOwner(DB, [9], { employee_no: 'E1', department: '研发部', employee_name: '张三' }, { createdBy: 'admin' });

    expect(result.changed).toBe(0);
    expect(countRows('pc_out', 9)).toBe(before);
  });

  it('保留旧的 pc_out 行，历史领用人依然可查', async () => {
    // 原本由 tests/asset-bulk.pc-owner.test.ts 用手写的 SQL 模式匹配 FakeDB 覆盖，
    // 迁到这里改成在真实引擎上跑。
    await makeAssigned(16, '1001', 'Old Name', 'IT');

    const result = await bulkUpdatePcOwner(DB, [16], {
      employee_no: '2002', employee_name: 'New Name', department: null,
    }, { createdBy: 'tester' });

    expect(result.changed).toBe(1);
    const history = raw
      .prepare(`SELECT employee_no, employee_name, department, created_by FROM pc_out WHERE asset_id=16 ORDER BY created_at ASC, id ASC`)
      .all() as Array<Record<string, unknown>>;
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ employee_no: '1001', employee_name: 'Old Name', department: 'IT' });
    // department 传 null 时沿用上一条出库记录的部门
    expect(history[1]).toMatchObject({ employee_no: '2002', employee_name: 'New Name', department: 'IT', created_by: 'tester' });
    expect(assetState(16).employeeNo).toBe('2002');
  });

  it('多台一起改也只发一个批次', async () => {
    const ids = [10, 11, 12, 13, 14];
    for (const id of ids) await makeAssigned(id, 'E1', '张三', '研发部');
    state.sqlByBatch = [];

    await bulkUpdatePcOwner(DB, ids, { employee_no: 'E5', department: '运维部', employee_name: '孙七' }, { createdBy: 'admin' });

    expect(batchContainingAll('INSERT INTO pc_out', 'UPDATE pc_assets', 'INSERT INTO pc_asset_latest_state')).toBe(0);
    for (const id of ids) expect(assetState(id).employeeNo).toBe('E5');
  });
});

describe('F4 单台写入的并发前置条件', () => {
  it('并发出库：第二次因守卫回滚，不产生第二条 pc_out', async () => {
    const asset = raw.prepare(`SELECT * FROM pc_assets WHERE id=20`).get() as Record<string, unknown>;

    await applyPcOut({
      db: DB, outNo: 'OUT-A', asset, employeeNo: 'E1', department: '研发部',
      employeeName: '张三', createdBy: 'admin', statusAfter: 'ASSIGNED',
    });
    expect(assetState(20).status).toBe('ASSIGNED');

    // 第二个请求带着同一份「出库前」快照到达 —— 旧实现会照样提交。
    await expect(applyPcOut({
      db: DB, outNo: 'OUT-B', asset, employeeNo: 'E2', department: '市场部',
      employeeName: '赵六', createdBy: 'admin', statusAfter: 'ASSIGNED',
    })).rejects.toBeInstanceOf(GuardRollbackError);

    expect(countRows('pc_out', 20)).toBe(1);
    expect(assetState(20).employeeNo).toBe('E1');
  });

  it('出库守卫回滚后，派生表不留任何痕迹', async () => {
    const asset = raw.prepare(`SELECT * FROM pc_assets WHERE id=21`).get() as Record<string, unknown>;
    await applyPcOut({
      db: DB, outNo: 'OUT-C', asset, employeeNo: 'E1', department: '研发部',
      employeeName: '张三', createdBy: 'admin', statusAfter: 'ASSIGNED',
    });
    const before = assetState(21);

    await expect(applyPcOut({
      db: DB, outNo: 'OUT-D', asset, employeeNo: 'E2', department: '市场部',
      employeeName: '赵六', createdBy: 'admin', statusAfter: 'ASSIGNED',
    })).rejects.toBeInstanceOf(GuardRollbackError);

    expect(assetState(21)).toEqual(before);
  });

  it('并发回收：第二次因守卫回滚', async () => {
    await makeAssigned(22);
    const asset = raw.prepare(`SELECT * FROM pc_assets WHERE id=22`).get() as Record<string, unknown>;

    await applyPcRecycle({
      db: DB, recycleNo: 'R-A', action: 'RETURN', asset, recycleDate: '2026-01-01', createdBy: 'admin',
    });
    expect(assetState(22).status).toBe('IN_STOCK');

    await expect(applyPcRecycle({
      db: DB, recycleNo: 'R-B', action: 'RECYCLE', asset, recycleDate: '2026-01-01', createdBy: 'admin',
    })).rejects.toBeInstanceOf(GuardRollbackError);

    expect(countRows('pc_recycle', 22)).toBe(1);
  });

  it('出库后立刻报废会被拒绝（status=ASSIGNED 不允许报废）', async () => {
    await makeAssigned(23);
    const rows = [raw.prepare(`SELECT * FROM pc_assets WHERE id=23`).get() as Record<string, unknown>];

    await expect(applyPcScrap({
      db: DB, scrapNo: 'S-A', rows, scrapDate: '2026-01-01', createdBy: 'admin',
    })).rejects.toBeInstanceOf(GuardRollbackError);

    expect(countRows('pc_scrap', 23)).toBe(0);
    expect(assetState(23).status).toBe('ASSIGNED');
  });

  it('在库资产报废成功，且状态经重算后不变', async () => {
    const rows = [raw.prepare(`SELECT * FROM pc_assets WHERE id=24`).get() as Record<string, unknown>];

    await applyPcScrap({ db: DB, scrapNo: 'S-B', rows, scrapDate: '2026-01-01', createdBy: 'admin' });

    expect(countRows('pc_scrap', 24)).toBe(1);
    expect(assetState(24).status).toBe('SCRAPPED');
    await recalcPcAssetStatuses(DB, [24]);
    expect(assetState(24).status).toBe('SCRAPPED');
  });

  it('F6 报废把台账、状态、派生表放进同一个批次', async () => {
    await makeAssigned(25, 'E3', '钱八', '法务部');
    // 先归还，让它离开 ASSIGNED 才能报废
    const assigned = raw.prepare(`SELECT * FROM pc_assets WHERE id=25`).get() as Record<string, unknown>;
    await applyPcRecycle({ db: DB, recycleNo: 'R-C', action: 'RETURN', asset: assigned, recycleDate: '2026-01-01', createdBy: 'admin' });

    const rows = [raw.prepare(`SELECT * FROM pc_assets WHERE id=25`).get() as Record<string, unknown>];
    state.sqlByBatch = [];
    await applyPcScrap({ db: DB, scrapNo: 'S-C', rows, scrapDate: '2026-01-02', createdBy: 'admin' });

    // 台账写入、状态更新、派生表重建必须落在同一个事务里（而不是先后两批）
    expect(batchContainingAll('INSERT INTO pc_scrap', "status='SCRAPPED'", 'INSERT INTO pc_asset_latest_state')).toBe(0);
    const after = assetState(25);
    expect(after.status).toBe('SCRAPPED');
    // 报废后派生表不该再挂着领用人
    expect(after.employeeNo).toBeNull();
  });

  it('多台报废时，其中一台被并发领用会让整批回滚', async () => {
    const rows = [
      raw.prepare(`SELECT * FROM pc_assets WHERE id=26`).get() as Record<string, unknown>,
      raw.prepare(`SELECT * FROM pc_assets WHERE id=27`).get() as Record<string, unknown>,
    ];
    // 27 在快照读取之后被并发领用
    raw.prepare(`UPDATE pc_assets SET status='ASSIGNED' WHERE id=27`).run();

    await expect(applyPcScrap({
      db: DB, scrapNo: 'S-D', rows, scrapDate: '2026-01-01', createdBy: 'admin',
    })).rejects.toBeInstanceOf(GuardRollbackError);

    // 26 本来是可以报废的，但必须跟着一起回滚
    expect(countRows('pc_scrap', 26)).toBe(0);
    expect(assetState(26).status).toBe('IN_STOCK');
  });
});
