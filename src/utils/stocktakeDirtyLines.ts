export type StocktakeLineLike = {
  id: number;
  sku: string;
  counted_qty: unknown;
};

export type StocktakeImportLine = {
  id: number;
  sku: string;
  counted_qty: number | null;
};

// 空值语义与 stocktakeView.isCountedEmpty / 后端 import 一致：纯空白串等于未盘
export function normalizeCountedQtyValue(raw: unknown) {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string' && raw.trim() === '') return '';
  const n = Number(raw);
  if (!Number.isFinite(n)) return '';
  return String(n);
}

// 后端对负数是静默 continue，前端必须自己拦住，否则用户看到“已保存 0 行”却无原因
export function isInvalidCountedQty(raw: unknown) {
  const normalized = normalizeCountedQtyValue(raw);
  if (normalized === '') return false;
  return Number(normalized) < 0;
}

export function buildDirtyImportLines(lines: StocktakeLineLike[], dirtyIds: Set<number>, baselineById: Map<number, string>) {
  return lines
    .filter((line) => dirtyIds.has(Number(line?.id || 0)))
    .map((line) => {
      const id = Number(line?.id || 0);
      const normalizedCurrent = normalizeCountedQtyValue(line?.counted_qty);
      const normalizedBaseline = baselineById.get(id) ?? '';
      const shouldSubmit = normalizedCurrent !== normalizedBaseline;
      const countedQty = normalizedCurrent === '' ? null : Number(normalizedCurrent);
      return {
        shouldSubmit,
        id,
        sku: String(line?.sku || ''),
        counted_qty: countedQty,
      };
    })
    .filter((line) => line.shouldSubmit && line.id > 0 && line.sku && (line.counted_qty === null || Number.isFinite(line.counted_qty)))
    .map((line) => ({ id: line.id, sku: line.sku, counted_qty: line.counted_qty }));
}
