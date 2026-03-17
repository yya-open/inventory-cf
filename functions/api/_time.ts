// Shared Beijing time helpers for backend APIs (Cloudflare Pages Functions / D1)
//
// 当前系统仍以“北京时间文本”作为持久化格式：YYYY-MM-DD HH:MM:SS。
// 为了避免到处手写 datetime('now','+8 hours')，统一通过这些 helper 生成 SQL 片段。

const STORAGE_OFFSET = '+8 hours';

/** Reusable DDL default expression for timestamps stored as Beijing text time. */
export const SQL_STORED_NOW_DEFAULT = `(datetime('now','${STORAGE_OFFSET}'))`;

/** Current timestamp in the project's persisted timezone (Asia/Shanghai text time). */
export const sqlNowStored = () => `datetime('now','${STORAGE_OFFSET}')`;

/** Relative timestamp in the project's persisted timezone. Example: sqlStoredHoursAgo(2). */
export const sqlStoredHoursAgo = (hours: number) => `datetime('now','${STORAGE_OFFSET}','-${Math.max(0, hours)} hours')`;

/** Relative timestamp in the project's persisted timezone. Example: sqlStoredDaysAgo(30). */
export const sqlStoredDaysAgo = (days: number) => `datetime('now','${STORAGE_OFFSET}','-${Math.max(0, days)} days')`;

/** Relative timestamp in minutes. */
export const sqlStoredMinutesAgo = (minutes: number) => `datetime('now','${STORAGE_OFFSET}','-${Math.max(0, minutes)} minutes')`;

/** Relative future timestamp in minutes. */
export const sqlStoredMinutesFromNow = (minutes: number) => `datetime('now','${STORAGE_OFFSET}','+${Math.max(0, minutes)} minutes')`;

/** SQL expr helpers for already-persisted timestamps. */
export const sqlBjDateTime = (expr: string) => `datetime(${expr})`;
export const sqlBjDate = (expr: string) => `date(${expr})`;

/** Build a Beijing-date-based filename suffix, e.g. 20260225 */
export function beijingDateStampCompact(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${get('year')}${get('month')}${get('day')}`;
}
