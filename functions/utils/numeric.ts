/**
 * 数值工具函数
 * 统一的数值钳位和验证逻辑
 */

/**
 * 将值钳位到指定范围内
 * @param v - 输入值
 * @param fallback - 默认值（当输入无效时）
 * @param min - 最小值
 * @param max - 最大值
 */
export function clampInt(v: any, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

/**
 * 将秒数钳位到指定范围内
 */
export function clampSeconds(value: unknown, fallback: number, min: number, max: number): number {
  return clampInt(value, fallback, min, max);
}

/**
 * 将比率值钳位到指定范围内
 * @param value - 输入值
 * @param fallback - 默认值（默认为 1）
 */
export function clampRate(value: unknown, fallback = 1): number {
  return clampInt(value, fallback, 1, 100);
}

/**
 * 将值限制在指定范围内（浮点数版本）
 */
export function clampFloat(v: any, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * 确保值为正整数
 */
export function ensurePositiveInt(v: any, fallback = 1): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.trunc(n);
}

/**
 * 安全地解析整数
 */
export function safeParseInt(v: any, fallback = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}
