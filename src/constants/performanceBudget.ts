export type PerfBudget = {
  key: string;
  label: string;
  maxBytes: number;
  scope: 'js' | 'css' | 'asset';
  match: RegExp;
  description: string;
};

export const PERFORMANCE_BUDGETS: PerfBudget[] = [
  {
    key: 'app_chunk',
    label: '普通页面 JS chunk',
    maxBytes: 80 * 1024,
    scope: 'js',
    match: /dist\/assets\/(?!element-plus|xlsx|vendor|vue-vendor).+\.js$/,
    description: '非基础库的普通页面 chunk 应保持轻量，避免日常查询页再次膨胀。',
  },
  {
    key: 'vendor',
    label: '通用 vendor chunk',
    maxBytes: 200 * 1024,
    scope: 'js',
    match: /dist\/assets\/vendor-.*\.js$/,
    description: '常驻基础依赖应保持在合理范围。',
  },
  {
    key: 'vue_vendor',
    label: 'Vue 运行时 chunk',
    maxBytes: 140 * 1024,
    scope: 'js',
    match: /dist\/assets\/vue-vendor-.*\.js$/,
    description: 'Vue 与路由公共运行时预算。',
  },
  {
    key: 'element_plus',
    label: 'Element Plus chunk',
    maxBytes: 900 * 1024,
    scope: 'js',
    match: /dist\/assets\/element-plus-.*\.js$/,
    description: 'UI 基础库体积仍然较大，需持续关注。',
  },
  {
    key: 'xlsx',
    label: 'Excel 处理 chunk',
    maxBytes: 450 * 1024,
    scope: 'js',
    match: /dist\/assets\/xlsx-.*\.js$/,
    description: 'Excel 仅应按需加载，体积不应继续明显上涨。',
  },
];

export function formatBudgetBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
