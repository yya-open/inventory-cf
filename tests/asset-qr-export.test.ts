import { describe, expect, it, vi } from 'vitest';
import {
  buildAssetQrPrintRecords,
  buildQrPrintPreflightWarnings,
  exportAssetQrPrintLocal,
  shouldUseAsyncQrPrintExport,
  type QrCardUtilsModule,
} from '../src/utils/assetQrExport';

type Row = { id: number; name: string };

function rows(): Row[] {
  return [
    { id: 2, name: 'B' },
    { id: 1, name: 'A' },
  ];
}

function qrUtils(): QrCardUtilsModule {
  return {
    downloadQrCardsPng: vi.fn(async () => {}),
    downloadQrSheetPng: vi.fn(async () => {}),
  };
}

describe('asset QR export helpers', () => {
  it('keeps print records in selected row order', async () => {
    const records = await buildAssetQrPrintRecords({
      rows: rows(),
      getId: (row) => row.id,
      fetchBulkLinks: vi.fn(async () => [
        { id: 1, url: 'https://example.test/a' },
        { id: 2, url: 'https://example.test/b' },
      ]),
      mapPrintRecord: (row, url) => ({ title: row.name, meta: [], url }),
    });

    expect(records.map((record) => record.title)).toEqual(['B', 'A']);
    expect(records.map((record) => record.url)).toEqual(['https://example.test/b', 'https://example.test/a']);
  });

  it('uses PNG card exporter for local card exports', async () => {
    const utils = qrUtils();

    const result = await exportAssetQrPrintLocal({
      mode: 'cards',
      rows: rows(),
      getId: (row) => row.id,
      fetchBulkLinks: vi.fn(async (ids) => ids.map((id) => ({ id: Number(id), url: `https://example.test/${id}` }))),
      mapPrintRecord: (row, url) => ({ title: row.name, meta: [], url }),
      loadQrCardUtils: async () => utils,
      filename: 'qr_cards',
      title: 'QR Cards',
    });

    expect(result).toEqual({ count: 2, empty: false });
    expect(utils.downloadQrCardsPng).toHaveBeenCalledTimes(1);
    expect(utils.downloadQrSheetPng).not.toHaveBeenCalled();
  });

  it('uses PNG sheet exporter for local sheet exports', async () => {
    const utils = qrUtils();

    const result = await exportAssetQrPrintLocal({
      mode: 'sheet',
      rows: rows(),
      getId: (row) => row.id,
      fetchBulkLinks: vi.fn(async (ids) => ids.map((id) => ({ id: Number(id), url: `https://example.test/${id}` }))),
      mapPrintRecord: (row, url) => ({ title: row.name, meta: [], url }),
      loadQrCardUtils: async () => utils,
      filename: 'qr_sheet',
      title: 'QR Sheet',
    });

    expect(result).toEqual({ count: 2, empty: false });
    expect(utils.downloadQrSheetPng).toHaveBeenCalledTimes(1);
    expect(utils.downloadQrCardsPng).not.toHaveBeenCalled();
  });

  it('does not load QR renderer when no records can be built', async () => {
    const loadQrCardUtils = vi.fn(async () => qrUtils());

    const result = await exportAssetQrPrintLocal({
      mode: 'cards',
      rows: rows(),
      getId: (row) => row.id,
      fetchBulkLinks: vi.fn(async () => []),
      mapPrintRecord: () => null,
      loadQrCardUtils,
      filename: 'empty',
      title: 'Empty',
    });

    expect(result).toEqual({ count: 0, empty: true });
    expect(loadQrCardUtils).not.toHaveBeenCalled();
  });

  it('chooses async mode and reports preflight risks for large dense exports', () => {
    expect(shouldUseAsyncQrPrintExport(80)).toBe(false);
    expect(shouldUseAsyncQrPrintExport(81)).toBe(true);

    const warnings = buildQrPrintPreflightWarnings('cards', {
      printer_profile: 'gprinter_203',
      qr_size_mm: 18,
      qr_margin_modules: 1,
      content_mode: 'detail',
      cols: 4,
      rows: 8,
    }, 120);

    expect(warnings.some((text) => text.includes('203 DPI'))).toBe(true);
    expect(warnings.some((text) => text.includes('留白'))).toBe(true);
    expect(warnings.some((text) => text.includes('异步任务'))).toBe(true);
  });
});
