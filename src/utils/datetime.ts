export function parseServerDateTime(input: any): Date | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  let d: Date;
  // D1 常见格式: YYYY-MM-DD HH:mm:ss (UTC)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    d = new Date(s.replace(' ', 'T') + 'Z');
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    // 纯日期按原样返回，避免时区偏移；用于日期型字段时建议直接显示原字符串
    d = new Date(s + 'T00:00:00Z');
  } else {
    d = new Date(s);
  }
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatBeijingDateTime(input: any): string {
  if (!input) return '';
  const d = parseServerDateTime(input);
  if (!d) return String(input ?? '');
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d).replace(/\//g, '-');
}

export function beijingTodayYmd(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDaysYmd(ymd: string, delta: number): string {
  const [y,m,d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m||1)-1, d||1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth()+1).padStart(2,'0');
  const dd = String(dt.getUTCDate()).padStart(2,'0');
  return `${yy}-${mm}-${dd}`;
}

export function formatBeijingNowDateTime(): string {
  return formatBeijingDateTime(new Date().toISOString());
}
