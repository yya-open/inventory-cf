// Shared Beijing time helpers for backend APIs (Cloudflare Pages Functions / D1)

/** SQL expr: convert UTC text datetime to Beijing datetime in SQLite */
export const sqlBjDateTime = (expr: string) => `datetime(${expr}, '+8 hours')`;

/** SQL expr: convert UTC text datetime to Beijing date (YYYY-MM-DD) in SQLite */
export const sqlBjDate = (expr: string) => `date(${sqlBjDateTime(expr)})`;

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
