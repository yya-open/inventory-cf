export function normalizeVisibleColumns(input: unknown, defaults: string[]) {
  const fallback = [...defaults];
  if (!Array.isArray(input)) return fallback;
  const allowed = new Set(defaults);
  const normalized = input
    .map((item) => String(item || '').trim())
    .filter((item, index, list) => item && allowed.has(item) && list.indexOf(item) === index);
  return normalized.length ? normalized : fallback;
}
