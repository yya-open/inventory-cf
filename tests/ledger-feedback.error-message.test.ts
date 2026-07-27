import { beforeEach, describe, expect, it, vi } from 'vitest';

// 门面依赖 Element Plus 运行时，测试里只需要断言「取到哪条文案」，因此替换掉服务层
const errorCalls: string[] = [];
vi.mock('../src/utils/el-services', () => ({
  ElMessage: {
    error: (message: string) => { errorCalls.push(message); },
    success: () => {},
    warning: () => {},
    info: () => {},
  },
  ElMessageBox: { confirm: async () => {} },
  ElNotification: () => {},
  ElLoading: {},
}));

const { showLedgerError } = await import('../src/utils/ledgerOperationFeedback');

describe('showLedgerError message resolution', () => {
  beforeEach(() => {
    errorCalls.length = 0;
  });

  it('uses backend message from real Error instances', () => {
    expect(showLedgerError(new Error('库存不足'), '操作失败')).toBe(true);
    expect(errorCalls).toEqual(['库存不足']);
  });

  // 关键回归点：apiClient 的 ApiError 跨 realm 或经包装后 instanceof 会失败，
  // 此前实现会丢掉后端 message，只显示 fallback
  it('keeps message on error-like objects that fail instanceof Error', () => {
    const apiErrorLike = { message: '当前账号的数据范围不包含该仓库', status: 403, error_code: 'SCOPE_WAREHOUSE_DENIED' };
    expect(showLedgerError(apiErrorLike, '操作失败')).toBe(true);
    expect(errorCalls).toEqual(['当前账号的数据范围不包含该仓库']);
  });

  it('falls back when error has no usable message', () => {
    showLedgerError(null, '初始化失败');
    showLedgerError({}, '导出失败');
    showLedgerError({ message: '   ' }, '导入失败');
    expect(errorCalls).toEqual(['初始化失败', '导出失败', '导入失败']);
  });

  it('stays silent and returns false for user cancellation', () => {
    expect(showLedgerError('cancel', '删除失败')).toBe(false);
    expect(showLedgerError('close', '删除失败')).toBe(false);
    expect(errorCalls).toEqual([]);
  });
});