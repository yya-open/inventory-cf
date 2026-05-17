import { beforeEach, describe, expect, it, vi } from 'vitest';

const qrState = vi.hoisted(() => ({ calls: [] as any[] }));
const saveState = vi.hoisted(() => ({ files: [] as Array<{ blob: Blob; filename: string }> }));
const zipState = vi.hoisted(() => ({ files: [] as Array<{ name: string; blob: Blob }> }));

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(async (url: string, options: any) => {
    qrState.calls.push({ url, options });
    return `data:image/png;base64,${btoa(String(url || 'qr'))}`;
  }),
}));

vi.mock('jszip', () => ({
  default: class MockZip {
    file(name: string, blob: Blob) {
      zipState.files.push({ name, blob });
    }
    async generateAsync() {
      return new Blob(['zip'], { type: 'application/zip' });
    }
  },
}));

vi.mock('../src/utils/operationFeedback', () => ({
  saveBlobAsFile: vi.fn((blob: Blob, filename: string) => {
    saveState.files.push({ blob, filename });
  }),
}));

import { downloadQrCardsPng, downloadQrSheetPng } from '../src/utils/qrCards';

function installCanvasDom() {
  const fillText = vi.fn();
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textBaseline: '',
    imageSmoothingEnabled: false,
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    lineTo: vi.fn(),
    fillText,
    measureText: vi.fn((text: string) => ({ width: String(text || '').length * 8 })),
  } as any;
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toBlob: vi.fn((cb: (blob: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' }))),
  };
  (globalThis as any).document = {
    createElement: vi.fn((tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected element: ${tag}`);
      return canvas;
    }),
  };
  (globalThis as any).Image = class MockImage {
    onload: null | (() => void) = null;
    onerror: null | (() => void) = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  };
  return { ctx, canvas, fillText };
}

describe('QR PNG renderer', () => {
  beforeEach(() => {
    qrState.calls = [];
    saveState.files = [];
    zipState.files = [];
    installCanvasDom();
  });

  it('uses high error correction for 203 DPI printer profiles', async () => {
    await downloadQrCardsPng('one', 'One', [{ title: 'A', meta: [], url: 'https://example.test/a' }], {
      printer_profile: 'gprinter_203',
      output_dpi: 203,
      qr_size_mm: 22,
    });

    expect(qrState.calls[0]?.options.errorCorrectionLevel).toBe('H');
    expect(qrState.calls[0]?.options.margin).toBe(3);
    expect(saveState.files[0]?.filename).toBe('one.png');
  });

  it('does not draw text for QR-only labels without a page header', async () => {
    const { fillText } = installCanvasDom();
    await downloadQrCardsPng('qr_only', 'QR Only', [{ title: 'Hidden title', subtitle: 'Hidden subtitle', meta: [{ label: '状态', value: '在用' }], url: 'https://example.test/only' }], {
      content_mode: 'qr_only',
      show_page_header: false,
      show_title: true,
      show_subtitle: true,
      show_meta: true,
    });

    expect(fillText).not.toHaveBeenCalled();
  });

  it('packs multiple rendered pages into a zip with page names', async () => {
    await downloadQrSheetPng('batch', 'Batch', [
      { title: 'A', meta: [], url: 'https://example.test/a' },
      { title: 'B', meta: [], url: 'https://example.test/b' },
    ], {
      cols: 1,
      rows: 1,
      show_page_header: false,
    });

    expect(zipState.files.map((file) => file.name)).toEqual(['batch_A.png', 'batch_B.png']);
    expect(saveState.files[0]?.filename).toBe('batch.zip');
  });
});
