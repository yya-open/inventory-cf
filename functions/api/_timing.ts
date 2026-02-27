// Minimal Server-Timing helper (for debugging slow first-load / cold start issues)

export function createTiming() {
  const started = Date.now();
  const parts: Record<string, number> = {};

  async function measure<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
    const s = Date.now();
    const v = await fn();
    parts[name] = Date.now() - s;
    return v;
  }

  function header() {
    const total = Date.now() - started;
    const items = Object.entries(parts).map(([k, v]) => `${k};dur=${v}`);
    items.push(`total;dur=${total}`);
    return items.join(", ");
  }

  return { measure, header };
}
