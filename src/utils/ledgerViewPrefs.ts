export type LedgerTableDensity = 'compact' | 'default' | 'comfortable';

export type LedgerSavedView = {
  name: string;
  visibleColumns: string[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  density: LedgerTableDensity;
  pageSize?: number;
  filters?: Record<string, unknown>;
  updatedAt: string;
};

const ALLOWED_DENSITIES: LedgerTableDensity[] = ['compact', 'default', 'comfortable'];

export function normalizeLedgerDensity(value: unknown, fallback: LedgerTableDensity = 'default'): LedgerTableDensity {
  return ALLOWED_DENSITIES.includes(value as LedgerTableDensity) ? (value as LedgerTableDensity) : fallback;
}

export function sanitizeLedgerViewName(value: unknown): string {
  return String(value || '').trim().slice(0, 24);
}

export function upsertLedgerSavedView(list: LedgerSavedView[], nextView: LedgerSavedView) {
  const nextName = sanitizeLedgerViewName(nextView.name);
  if (!nextName) return list;
  const rest = Array.isArray(list) ? list.filter((item) => sanitizeLedgerViewName(item?.name) !== nextName) : [];
  return [
    {
      ...nextView,
      name: nextName,
      density: normalizeLedgerDensity(nextView.density),
      updatedAt: nextView.updatedAt || new Date().toISOString(),
    },
    ...rest,
  ].slice(0, 8);
}

export function removeLedgerSavedView(list: LedgerSavedView[], name: string) {
  const target = sanitizeLedgerViewName(name);
  return Array.isArray(list) ? list.filter((item) => sanitizeLedgerViewName(item?.name) !== target) : [];
}

export function findLedgerSavedView(list: LedgerSavedView[], name: string) {
  const target = sanitizeLedgerViewName(name);
  return (Array.isArray(list) ? list : []).find((item) => sanitizeLedgerViewName(item?.name) === target) || null;
}
