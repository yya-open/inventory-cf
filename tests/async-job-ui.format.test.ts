import { describe, expect, it } from 'vitest';

import { canDeleteJob, formatBytes, formatDuration, statusText, statusType } from '../src/utils/asyncJobUi';

describe('formatBytes', () => {
  it('零值返回短横', () => {
    expect(formatBytes(0)).toBe('-');
    expect(formatBytes(null)).toBe('-');
    expect(formatBytes(undefined)).toBe('-');
  });

  it('小于 1024 字节按字节显示（守住字节级分支，512 不会变成 0.5 KB）', () => {
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('恰好 1024 以 KB 显示，保留一位小数', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('大于等于 1MB 以 MB 显示，保留两位小数', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
    expect(formatBytes(1024 * 1024 * 2)).toBe('2.00 MB');
    expect(formatBytes(1024 * 1024 * 1.5)).toBe('1.50 MB');
    expect(formatBytes(1024 * 1024 * 100)).toBe('100.00 MB');
  });
});

describe('formatDuration', () => {
  it('零值返回短横', () => {
    expect(formatDuration(0)).toBe('-');
    expect(formatDuration(null)).toBe('-');
    expect(formatDuration(undefined)).toBe('-');
  });

  it('负数返回短横（守住负数守卫，-5 不会渲染成 "-5ms"）', () => {
    expect(formatDuration(-1)).toBe('-');
    expect(formatDuration(-5)).toBe('-');
    expect(formatDuration(-1000)).toBe('-');
  });

  it('小于 1000 毫秒按毫秒显示', () => {
    expect(formatDuration(1)).toBe('1ms');
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('1000 毫秒及以上按秒显示', () => {
    expect(formatDuration(1000)).toBe('1秒');
    expect(formatDuration(5000)).toBe('5秒');
    expect(formatDuration(59999)).toBe('59秒');
  });

  it('60000 毫秒及以上按分钟显示', () => {
    expect(formatDuration(60000)).toBe('1分钟');
    expect(formatDuration(120000)).toBe('2分钟');
    expect(formatDuration(3599999)).toBe('59分钟');
  });

  it('3600000 毫秒及以上按小时显示', () => {
    expect(formatDuration(3600000)).toBe('1小时');
    expect(formatDuration(7200000)).toBe('2小时');
    expect(formatDuration(86399999)).toBe('23小时');
  });

  it('86400000 毫秒及以上按天显示', () => {
    expect(formatDuration(86400000)).toBe('1天');
    expect(formatDuration(172800000)).toBe('2天');
    expect(formatDuration(864000000)).toBe('10天');
  });
});

describe('statusText', () => {
  it('五个已知状态各自映射到中文', () => {
    expect(statusText('queued')).toBe('排队中');
    expect(statusText('running')).toBe('执行中');
    expect(statusText('success')).toBe('成功');
    expect(statusText('failed')).toBe('失败');
    expect(statusText('canceled')).toBe('已取消');
  });

  it('空字符串返回短横（守住空状态兜底，防止 el-tag 渲染空白标签）', () => {
    expect(statusText('')).toBe('-');
  });

  it('null 或 undefined 返回短横', () => {
    expect(statusText(null)).toBe('-');
    expect(statusText(undefined)).toBe('-');
  });

  it('未知非空状态原样返回', () => {
    expect(statusText('unknown')).toBe('unknown');
    expect(statusText('pending')).toBe('pending');
    expect(statusText('archived')).toBe('archived');
  });
});

describe('statusType', () => {
  it('success 映射到 success', () => {
    expect(statusType('success')).toBe('success');
  });

  it('failed 映射到 danger', () => {
    expect(statusType('failed')).toBe('danger');
  });

  it('canceled 映射到 info', () => {
    expect(statusType('canceled')).toBe('info');
  });

  it('running 映射到 warning', () => {
    expect(statusType('running')).toBe('warning');
  });

  it('queued 和其他未知状态映射到 info', () => {
    expect(statusType('queued')).toBe('info');
    expect(statusType('unknown')).toBe('info');
    expect(statusType('')).toBe('info');
    expect(statusType(null)).toBe('info');
    expect(statusType(undefined)).toBe('info');
  });
});

describe('canDeleteJob', () => {
  it('queued 和 running 状态不可删除', () => {
    expect(canDeleteJob({ status: 'queued' })).toBe(false);
    expect(canDeleteJob({ status: 'running' })).toBe(false);
  });

  it('success、failed、canceled 状态可删除', () => {
    expect(canDeleteJob({ status: 'success' })).toBe(true);
    expect(canDeleteJob({ status: 'failed' })).toBe(true);
    expect(canDeleteJob({ status: 'canceled' })).toBe(true);
  });

  it('null 或非对象输入返回 false', () => {
    expect(canDeleteJob(null)).toBe(false);
    expect(canDeleteJob(undefined)).toBe(false);
    expect(canDeleteJob('not-an-object')).toBe(false);
    expect(canDeleteJob(123)).toBe(false);
  });

  it('缺少 status 字段的对象可删除（status 默认空字符串，不在阻止列表）', () => {
    expect(canDeleteJob({})).toBe(true);
    expect(canDeleteJob({ id: 1 })).toBe(true);
  });

  it('未知状态可删除', () => {
    expect(canDeleteJob({ status: 'unknown' })).toBe(true);
    expect(canDeleteJob({ status: 'archived' })).toBe(true);
  });
});
