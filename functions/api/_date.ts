// Small shared helpers for date/time query parameters.
//
// D1 stores timestamps as TEXT in "YYYY-MM-DD HH:mm:ss" format in this project.
// When the UI sends only a date (YYYY-MM-DD), we normalize it to a full-day range
// to avoid the common "date_to filters out the whole day" bug.

export function toSqlRange(dateStr?: string | null, endOfDay?: boolean) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  // Accept YYYY-MM-DD or ISO-like strings; normalize YYYY-MM-DD to sqlite datetime string.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return endOfDay ? `${s} 23:59:59` : `${s} 00:00:00`;
  }
  return s;
}
