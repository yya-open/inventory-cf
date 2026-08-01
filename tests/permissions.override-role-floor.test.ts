import { describe, expect, it } from 'vitest';

import {
  ALL_PERMISSION_CODES,
  getUserPermissionMap,
  isPermissionGrantableToRole,
  setUserPermissions,
  type PermissionCode,
} from '../functions/_permissions';

/**
 * 逐用户权限覆盖的角色上限（CWE-266 / CWE-269）。
 *
 * normalizePermissionTemplateCode 早就守住了「模板不得越过角色」，但 user_permissions 里的
 * 覆盖行过去是无条件生效的：只要管理员给某个 viewer 勾一次 async_job_manage，这条记录就
 * 会被 getUserPermissionMap 原样加载。而仓库里每一处 requirePermission 都只要求
 * minRole 'viewer'，权限位就是唯一的闸门 —— 于是这一次勾选等于交出整库备份与审计清除。
 *
 * 这里调用真实模块，不复刻上限表：复刻的话，模板表改了而复刻没跟着改，测试照样通过。
 */

/** 只接 getUserPermissionMap 用到的那几个 D1 方法。 */
function dbReturning(rows: { permission_code: string; allowed: number }[]) {
  const db = {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async all() {
              if (sql.includes('FROM user_permissions')) return { results: rows };
              return { results: [] };
            },
            async run() {
              return { success: true };
            },
            async first() {
              return null;
            },
          };
        },
        async run() {
          return { success: true };
        },
      };
    },
    async batch() {
      return [];
    },
  };
  return db as unknown as D1Database;
}

/** 记录实际落库的覆盖写入，用于断言越权授予根本没走到 batch。 */
function writeCapturingDb() {
  const batched: unknown[][] = [];
  const db = {
    prepare(sql: string) {
      const stmt = {
        bind(...params: unknown[]) {
          return {
            async all() {
              if (sql.includes('FROM user_permissions')) return { results: [] };
              return { results: [] };
            },
            async run() {
              return { success: true };
            },
            async first() {
              return null;
            },
            __params: params,
          };
        },
        async run() {
          return { success: true };
        },
      };
      return stmt;
    },
    async batch(statements: unknown[]) {
      batched.push(statements);
      return [];
    },
  };
  return { db: db as unknown as D1Database, batched };
}

describe('per-user permission override role floor', () => {
  it('viewer 的可授予集合只有 audit_export', () => {
    const grantable = ALL_PERMISSION_CODES.filter((code) => isPermissionGrantableToRole('viewer', code));
    expect(grantable).toEqual(['audit_export']);
  });

  it('operator 的可授予集合是 audit_export / bulk_operation / qr_export', () => {
    const grantable = ALL_PERMISSION_CODES.filter((code) => isPermissionGrantableToRole('operator', code));
    expect([...grantable].sort()).toEqual(['audit_export', 'bulk_operation', 'qr_export']);
  });

  it('admin 可以持有全部权限', () => {
    for (const code of ALL_PERMISSION_CODES) expect(isPermissionGrantableToRole('admin', code)).toBe(true);
  });

  it('忽略 viewer 名下越过上限的 async_job_manage 授予', async () => {
    // 这正是让「客户端选权限」的 job 缺陷可达的那条记录。
    const db = dbReturning([{ permission_code: 'async_job_manage', allowed: 1 }]);
    const map = await getUserPermissionMap(db, 501, 'viewer', 'readonly');

    expect(map.async_job_manage).toBe(false);
  });

  it('viewer 名下 ops_tools / asset_purge / system_settings_write 的授予同样无效', async () => {
    const db = dbReturning([
      { permission_code: 'ops_tools', allowed: 1 },
      { permission_code: 'asset_purge', allowed: 1 },
      { permission_code: 'system_settings_write', allowed: 1 },
    ]);
    const map = await getUserPermissionMap(db, 502, 'viewer', 'readonly');

    expect(map.ops_tools).toBe(false);
    expect(map.asset_purge).toBe(false);
    expect(map.system_settings_write).toBe(false);
  });

  it('上限之内的 viewer 授予（audit_export）仍然生效', async () => {
    const db = dbReturning([{ permission_code: 'audit_export', allowed: 1 }]);
    const map = await getUserPermissionMap(db, 503, 'viewer', 'readonly');

    expect(map.audit_export).toBe(true);
  });

  it('拒绝不受上限约束：越限权限也能被显式关掉', async () => {
    // allowed=0 永远生效，否则「收回权限」会被上限逻辑吃掉。
    const db = dbReturning([{ permission_code: 'bulk_operation', allowed: 0 }]);
    const map = await getUserPermissionMap(db, 504, 'operator', 'operator_plus');

    expect(map.bulk_operation).toBe(false);
  });

  it('setUserPermissions 对越限授予抛 400 且不写库', async () => {
    const { db, batched } = writeCapturingDb();

    await expect(
      setUserPermissions(db, 505, 'viewer', { async_job_manage: true }, 'admin')
    ).rejects.toMatchObject({ status: 400 });
    expect(batched).toHaveLength(0);
  });

  it('setUserPermissions 允许上限之内的授予', async () => {
    const { db, batched } = writeCapturingDb();

    await setUserPermissions(db, 506, 'viewer', { audit_export: true }, 'admin');
    expect(batched).toHaveLength(1);
  });

  it('setUserPermissions 允许撤销一个越限权限', async () => {
    // 历史遗留的越权行必须能被收回，否则上限反而锁死了修复路径。
    const { db, batched } = writeCapturingDb();

    await setUserPermissions(db, 507, 'viewer', { async_job_manage: false } as Partial<Record<PermissionCode, boolean>>, 'admin');
    expect(batched).toHaveLength(1);
  });
});
