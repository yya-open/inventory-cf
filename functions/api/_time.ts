// Shared Beijing time helpers for backend APIs (Cloudflare Pages Functions / D1)

/**
 * SQL expr helpers.
 *
 * 当前系统约定：数据库里存的是北京时间（UTC+8）的文本时间：'YYYY-MM-DD HH:MM:SS'。
 * 所以这里不再做 +8 hours 的转换，直接返回原表达式的 datetime/date。
 */
export const sqlBjDateTime = (expr: string) => `datetime(${expr})`;

/** SQL expr: Beijing date (YYYY-MM-DD) */
export const sqlBjDate = (expr: string) => `date(${expr})`;

/** Build a Beijing-date-based filename suffix, e.g. 20260225 */
export function beijingDateStampCompact(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return `${get('year')}${get('month')}${get('day')}`;
}
