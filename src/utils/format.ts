/**
 * 数量展示统一走千分位（zh-CN 分组）；非法输入回退为 0，
 * 避免接口异常值直接把 NaN 渲染到页面上。
 */
export function formatQty(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('zh-CN');
}