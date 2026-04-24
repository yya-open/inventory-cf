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

export function normalizeCountedQtyValue(raw: unknown) {
  if (raw === null || raw === undefined || raw === '') return '';
  const n = Number(raw);
  if (!Number.isFinite(n)) return '';
  return String(n);
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
