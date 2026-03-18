export function normalizeVisibleColumns(input: unknown, defaults: string[]) {
  const fallback = [...defaults];
  if (!Array.isArray(input)) return fallback;
  const allowed = new Set(defaults);
  const normalized = input
    .map((item) => String(item || '').trim())
    .filter((item, index, list) => item && allowed.has(item) && list.indexOf(item) === index);
  return normalized.length ? normalized : fallback;
}

export function normalizeColumnOrder(input: unknown, defaults: string[]) {
  const fallback = [...defaults];
  if (!Array.isArray(input)) return fallback;
  const allowed = new Set(defaults);
  const picked = input
    .map((item) => String(item || '').trim())
    .filter((item, index, list) => item && allowed.has(item) && list.indexOf(item) === index);
  const missing = defaults.filter((item) => !picked.includes(item));
  return [...picked, ...missing];
}

export function orderVisibleColumns(visible: string[], order: string[]) {
  const visibleSet = new Set(normalizeVisibleColumns(visible, order));
  return order.filter((key) => visibleSet.has(key));
}

export function moveColumnKey(order: string[], key: string, direction: 'up' | 'down') {
  const next = [...order];
  const index = next.indexOf(key);
  if (index < 0) return next;
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= next.length) return next;
  const [item] = next.splice(index, 1);
  next.splice(targetIndex, 0, item);
  return next;
}

export function normalizeColumnWidths(input: unknown, defaults: string[]) {
  const output: Record<string, number> = {};
  if (!input || typeof input !== 'object') return output;
  const allowed = new Set(defaults);
  Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
    const width = Number(value);
    if (!allowed.has(key) || !Number.isFinite(width) || width < 60) return;
    output[key] = Math.round(width);
  });
  return output;
}

export function setColumnWidth(widths: Record<string, number>, key: string, width: number) {
  const next = { ...widths };
  const normalized = Math.max(60, Math.round(Number(width) || 0));
  if (!Number.isFinite(normalized) || normalized <= 0) return next;
  next[key] = normalized;
  return next;
}
