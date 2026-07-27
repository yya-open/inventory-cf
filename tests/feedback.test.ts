import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  messages: [] as Array<Record<string, unknown>>,
  notifications: [] as Array<Record<string, unknown>>,
  confirms: [] as unknown[][],
  prompts: [] as unknown[][],
  alerts: [] as unknown[][],
  closePending: vi.fn(),
}));

vi.mock('../src/utils/el-services', () => ({
  ElMessage: Object.assign(
    (options: Record<string, unknown>) => {
      calls.messages.push(options);
      return { close: calls.closePending };
    },
    { success: vi.fn(), warning: vi.fn(), info: vi.fn(), error: vi.fn() }
  ),
  ElMessageBox: {
    confirm: (...args: unknown[]) => {
      calls.confirms.push(args);
      return Promise.resolve('confirm');
    },
    prompt: (...args: unknown[]) => {
      calls.prompts.push(args);
      return Promise.resolve({ value: '删除' });
    },
    alert: (...args: unknown[]) => {
      calls.alerts.push(args);
      return Promise.resolve('close');
    },
  },
  ElNotification: (options: Record<string, unknown>) => {
    calls.notifications.push(options);
  },
}));

const feedback = await import('../src/utils/feedback');

describe('feedback facade', () => {
  beforeEach(() => {
    calls.messages.length = 0;
    calls.notifications.length = 0;
    calls.confirms.length = 0;
    calls.prompts.length = 0;
    calls.alerts.length = 0;
    calls.closePending.mockClear();
  });

  it('keeps error-like object messages even when instanceof Error fails', () => {
    expect(feedback.showApiError({ message: '当前账号的数据范围不包含该仓库' }, '操作失败')).toBe(true);
    expect(calls.messages).toEqual([{ type: 'error', message: '当前账号的数据范围不包含该仓库' }]);
  });

  it('falls back for missing or blank error messages and stays silent for cancellation', () => {
    feedback.showApiError(null, '初始化失败');
    feedback.showApiError({ message: '   ' }, '导入失败');
    expect(feedback.showApiError('cancel', '删除失败')).toBe(false);
    expect(feedback.showApiError('close', '删除失败')).toBe(false);
    expect(feedback.showApiError({ message: 'cancel' }, '删除失败')).toBe(false);
    expect(feedback.showApiError({ message: 'close' }, '删除失败')).toBe(false);
    expect(calls.messages).toEqual([
      { type: 'error', message: '初始化失败' },
      { type: 'error', message: '导入失败' },
    ]);
  });

  // showError 只发文案，不做异常解包：避免误传字符串时静默丢失真实提示。
  it('shows plain error text without unwrapping', () => {
    feedback.showError('读取失败');
    feedback.showError('保存失败', { duration: 4000, showClose: true });
    expect(calls.messages).toEqual([
      { type: 'error', message: '读取失败' },
      { type: 'error', message: '保存失败', duration: 4000, showClose: true },
    ]);
  });

  it('forwards custom duration and close behavior for transient messages', () => {
    feedback.showSuccess('恢复成功', { duration: 2000, showClose: true });
    feedback.showWarning('请确认影响范围', { duration: 3000, showClose: true });
    feedback.showInfo('正在加载');
    expect(calls.messages).toEqual([
      { type: 'success', message: '恢复成功', duration: 2000, showClose: true },
      { type: 'warning', message: '请确认影响范围', duration: 3000, showClose: true },
      { type: 'info', message: '正在加载' },
    ]);
  });

  it('returns a minimal close handle for pending messages', () => {
    const pending = feedback.showPending('正在批量删除任务，请稍候…');
    expect(calls.messages).toEqual([{ type: 'info', message: '正在批量删除任务，请稍候…', duration: 0, showClose: false }]);
    pending.close();
    expect(calls.closePending).toHaveBeenCalledTimes(1);
  });

  it('maps notification, confirmation, prompt and HTML alert options', async () => {
    feedback.notifyAction('导出已开始', '文件正在生成，请稍候。', 'info');
    await feedback.confirmAction({ title: '删除确认', message: '确认继续？', confirmButtonText: '删除', distinguishCancelAndClose: true });
    const validator = (value: string) => value === '删除' || '需要输入「删除」';
    await feedback.promptAction({ title: '删除已应用盘点单', message: '请输入「删除」确认。', inputPlaceholder: '删除', inputValue: '', inputType: 'textarea', inputValidator: validator });
    await feedback.alertAction({ title: '导入失败明细', message: '第 2 行名称不能为空', type: 'error', confirmButtonText: '我知道了' });
    await feedback.alertHtml({ title: '导入提示', html: '<b>存在问题</b>', type: 'warning' });

    expect(calls.notifications).toEqual([{ title: '导出已开始', message: '文件正在生成，请稍候。', type: 'info', duration: 2600, offset: 72 }]);
    expect(calls.confirms).toEqual([['确认继续？', '删除确认', { confirmButtonText: '删除', distinguishCancelAndClose: true }]]);
    expect(calls.prompts).toEqual([['请输入「删除」确认。', '删除已应用盘点单', { inputPlaceholder: '删除', inputValue: '', inputType: 'textarea', inputValidator: validator }]]);
    expect(calls.alerts).toEqual([
      ['第 2 行名称不能为空', '导入失败明细', { type: 'error', confirmButtonText: '我知道了' }],
      ['<b>存在问题</b>', '导入提示', { type: 'warning', dangerouslyUseHTMLString: true }],
    ]);
  });
});