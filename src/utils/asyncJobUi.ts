export const ASYNC_JOB_TYPE_LABELS: Record<string, string> = {
  AUDIT_EXPORT: '审计日志导出',
  AUDIT_ARCHIVE_EXPORT: '审计归档导出',
  BACKUP_EXPORT: '数据库备份导出',
  PC_AGE_WARNING_EXPORT: '电脑报废预警导出',
  DASHBOARD_PRECOMPUTE: '看板快照预计算',
  OPS_SCAN_REFRESH: '运维深度巡检',
  PC_QR_KEY_INIT: '电脑二维码补齐',
  MONITOR_QR_KEY_INIT: '显示器二维码补齐',
  PC_QR_CARDS_EXPORT: '电脑二维码卡片导出',
  PC_QR_SHEET_EXPORT: '电脑二维码图版导出',
  MONITOR_QR_CARDS_EXPORT: '显示器二维码卡片导出',
  MONITOR_QR_SHEET_EXPORT: '显示器二维码图版导出',
  ASSET_INVENTORY_BATCH_SNAPSHOT_EXPORT: '盘点批次结果快照导出',
};

export type AsyncJobTypeOption = { value: string; label: string };
export type AsyncJobTypeGroup = { label: string; options: AsyncJobTypeOption[] };

const JOB_TYPE_GROUP_DEFS: Array<{ label: string; values: string[] }> = [
  {
    label: '盘点与台账',
    values: ['ASSET_INVENTORY_BATCH_SNAPSHOT_EXPORT', 'PC_AGE_WARNING_EXPORT'],
  },
  {
    label: '二维码与标签',
    values: [
      'PC_QR_KEY_INIT',
      'MONITOR_QR_KEY_INIT',
      'PC_QR_CARDS_EXPORT',
      'PC_QR_SHEET_EXPORT',
      'MONITOR_QR_CARDS_EXPORT',
      'MONITOR_QR_SHEET_EXPORT',
    ],
  },
  {
    label: '备份与审计',
    values: ['BACKUP_EXPORT', 'AUDIT_EXPORT', 'AUDIT_ARCHIVE_EXPORT'],
  },
  {
    label: '运维与看板',
    values: ['DASHBOARD_PRECOMPUTE', 'OPS_SCAN_REFRESH'],
  },
];

function toOption(value: string): AsyncJobTypeOption {
  return { value, label: formatAsyncJobType(value) };
}

export const ASYNC_JOB_TYPE_OPTIONS: AsyncJobTypeOption[] = Object.keys(ASYNC_JOB_TYPE_LABELS).map(toOption);

export const ASYNC_JOB_TYPE_GROUPS: AsyncJobTypeGroup[] = JOB_TYPE_GROUP_DEFS.map((group) => ({
  label: group.label,
  options: group.values.map(toOption),
}));

export function formatAsyncJobType(jobType: string | null | undefined) {
  const raw = String(jobType || '').trim();
  if (!raw) return '-';
  if (ASYNC_JOB_TYPE_LABELS[raw]) return ASYNC_JOB_TYPE_LABELS[raw];
  return raw
    .split('_')
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function buildAsyncJobTypeGroups(extraTypes: Array<string | null | undefined> = []): AsyncJobTypeGroup[] {
  const seen = new Set<string>();
  const groups = ASYNC_JOB_TYPE_GROUPS.map((group) => ({
    label: group.label,
    options: group.options.filter((item) => {
      seen.add(item.value);
      return true;
    }),
  }));

  const extras = extraTypes
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((value) => !seen.has(value))
    .sort((a, b) => formatAsyncJobType(a).localeCompare(formatAsyncJobType(b), 'zh-CN'))
    .map(toOption);

  if (extras.length) groups.push({ label: '其他', options: extras });
  return groups;
}

export function formatDuration(ms: number | null | undefined): string {
  const value = Number(ms || 0);
  // 负数守卫:SystemTaskCenter 的耗时列会渲染尚未完成/时钟回拨导致的负 duration_ms,缺了这个分支会渲染出 "-5ms"。
  if (!value || value < 0) return '-';
  if (value >= 1000 * 60 * 60 * 24) return `${Math.floor(value / 1000 / 60 / 60 / 24)}天`;
  if (value >= 1000 * 60 * 60) return `${Math.floor(value / 1000 / 60 / 60)}小时`;
  if (value >= 1000 * 60) return `${Math.floor(value / 1000 / 60)}分钟`;
  if (value >= 1000) return `${Math.floor(value / 1000)}秒`;
  return `${value}ms`;
}

export function formatBytes(value: number | null | undefined): string {
  const size = Number(value || 0);
  if (!size) return '-';
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
  // 字节级分支:SystemTaskCenter 的"结果大小"列常出现小于 1KB 的结果体,缺了这个分支 512 会渲染成 "0.5 KB"，精度丢失。
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(1)} KB`;
}

export function statusText(status: string | null | undefined): string {
  const map: Record<string, string> = {
    queued: '排队中',
    running: '执行中',
    success: '成功',
    failed: '失败',
    canceled: '已取消',
  };
  const key = String(status || '');
  // 空状态兜底 '-':SystemTaskCenter 模板把结果直接塞进 <el-tag>，返回空串会渲染出一个空白标签。
  return map[key] || key || '-';
}

export function statusType(status: string | null | undefined): 'success' | 'danger' | 'warning' | 'info' {
  const s = String(status || '');
  if (s === 'success') return 'success';
  if (s === 'failed') return 'danger';
  if (s === 'canceled') return 'info';
  if (s === 'running') return 'warning';
  return 'info';
}

export function canDeleteJob(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const status = 'status' in row ? String(row.status || '') : '';
  return !['queued', 'running'].includes(status);
}
