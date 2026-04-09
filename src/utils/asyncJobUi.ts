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
