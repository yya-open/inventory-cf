// Minimal Server-Timing helper (for debugging slow first-load / cold start issues)

export function createTiming() {
  const started = Date.now();
  const parts: Record<string, number> = {};

  function add(name: string, durMs: number) {
    if (!Number.isFinite(durMs) || durMs < 0) return;
    parts[name] = (parts[name] || 0) + durMs;
  }

  async function measure<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
    const s = Date.now();
    const v = await fn();
    add(name, Date.now() - s);
    return v;
  }

  function totalMs() {
    return Date.now() - started;
  }

  function header() {
    const total = totalMs();
    const items = Object.entries(parts).map(([k, v]) => `${k};dur=${v}`);
    items.push(`total;dur=${total}`);
    return items.join(", ");
  }

  return { add, measure, header, totalMs, parts };
}
