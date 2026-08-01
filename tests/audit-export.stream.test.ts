import { describe, expect, it } from 'vitest';
import { buildAuditExportCsvResult } from '../functions/api/services/async-jobs';

type AuditRow = {
  id: number;
  created_at: string;
  username: string;
  module_code: string;
  action: string;
  entity: string;
  entity_id: string;
  target_name?: string | null;
  target_code?: string | null;
  summary_text?: string | null;
};

class FakeStatement {
  private params: any[] = [];

  constructor(private rows: AuditRow[], private sql: string) {}

  bind(...params: any[]) {
    this.params = params;
    return this;
  }

  async first<T = any>() {
    const normalized = this.sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.startsWith('select count(*) as c from audit_log')) {
      return { c: this.rows.length } as T;
    }
    throw new Error(`Unhandled first() SQL: ${this.sql}`);
  }

  async all<T = any>() {
    const normalized = this.sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalized.startsWith('select a.id, a.created_at')) {
      throw new Error(`Unhandled all() SQL: ${this.sql}`);
    }
    // 两种页窗口形态，绑定尾部不同：
    //   OFFSET 形态 -> [..., limit, offset]
    //   keyset 形态 -> [..., cursor..., limit]
    // 这个 fake 只模拟「有序序列的翻页」，不模拟排序方向；方向与重复排序键的正确性
    // 由 tests/export.keyset-pagination.test.ts 在真实 SQLite 上覆盖。
    if (normalized.includes('limit ? offset ?')) {
      const limit = Number(this.params[this.params.length - 2] || 0);
      const offset = Number(this.params[this.params.length - 1] || 0);
      return { results: this.rows.slice(offset, offset + limit) } as any;
    }
    const limit = Number(this.params[this.params.length - 1] || 0);
    const afterId = Number(this.params[this.params.length - 2] || 0);
    const startIndex = this.rows.findIndex((row) => row.id === afterId) + 1;
    return { results: this.rows.slice(startIndex, startIndex + limit) } as any;
  }
}

class FakeDB {
  constructor(private rows: AuditRow[]) {}

  prepare(sql: string) {
    return new FakeStatement(this.rows, sql);
  }
}

function makeRows(count: number): AuditRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    created_at: `2026-01-01 00:00:${String(i % 60).padStart(2, '0')}`,
    username: `user${i + 1}`,
    module_code: 'AUDIT',
    action: 'LOGIN',
    entity: 'users',
    entity_id: String(i + 1),
    target_name: `名称,${i + 1}`,
    summary_text: `摘要 ${i + 1}`,
  }));
}

describe('buildAuditExportCsvResult', () => {
  it('streams paged CSV to a bucket without buffering all rows', async () => {
    const rows = makeRows(2500);
    const db = new FakeDB(rows);
    const result = await buildAuditExportCsvResult(db as any, { scope: 'all' }, {} as any);

    expect(result.stream).toBeTruthy();
    expect(result.text).toBeUndefined();

    const bytes = new Uint8Array(await new Response(result.stream as ReadableStream<Uint8Array>).arrayBuffer());
    // UTF-8 BOM prefix (Response.text() would strip it, so assert raw bytes).
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    const lines = text.split('\n');

    expect(lines[0]).toContain('时间');
    // Header + 2500 data rows, each row terminated by '\n' (trailing empty element).
    expect(lines).toHaveLength(2502);
    expect(lines[2501]).toBe('');
    // CSV escaping preserved across the streamed rows.
    expect(lines[1]).toContain('"名称,1"');
    expect(lines[2500]).toContain('"名称,2500"');
  });

  it('returns bounded inline text when no bucket is bound', async () => {
    const rows = makeRows(3);
    const db = new FakeDB(rows);
    const result = await buildAuditExportCsvResult(db as any, { scope: 'all' }, undefined);

    expect(result.stream).toBeUndefined();
    expect(typeof result.text).toBe('string');
    const lines = String(result.text).split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0].startsWith('\ufeff')).toBe(true);
  });

  it('honors current-page scope offset and page size', async () => {
    const rows = makeRows(500);
    const db = new FakeDB(rows);
    const result = await buildAuditExportCsvResult(
      db as any,
      { scope: 'current', page: '2', page_size: '20' },
      undefined,
    );

    const lines = String(result.text).split('\n');
    // header + 20 rows for page 2.
    expect(lines).toHaveLength(21);
    expect(lines[1]).toContain('user21');
    expect(lines[20]).toContain('user40');
  });
});
