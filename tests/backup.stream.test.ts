import { describe, expect, it } from 'vitest';
import { createBackupJsonStream } from '../functions/api/admin/_backup_helpers';
import { validateBackupEnvelope } from '../functions/api/admin/_backup_integrity';
import { iterBackupRowsFromStream, readBackupEnvelopeMetadataFromStream } from '../functions/api/admin/restore_job/_util';

type TableMap = Record<string, any[]>;

class FakeStatement {
  private params: any[] = [];

  constructor(private tables: TableMap, private sql: string) {}

  bind(...params: any[]) {
    this.params = params;
    return this;
  }

  async first<T = any>() {
    return this.execute() as T;
  }

  async all<T = any>() {
    const results = this.execute();
    return { results: Array.isArray(results) ? results : [] as T[] } as any;
  }

  private execute() {
    const normalized = this.sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.startsWith('select count(*) as c from warehouses')) {
      return { c: (this.tables.warehouses || []).length };
    }
    if (normalized.startsWith('select count(*) as c from public_api_throttle')) {
      return { c: (this.tables.public_api_throttle || []).length };
    }
    if (normalized.startsWith('select id,name,created_at from warehouses')) {
      const afterId = Number(this.params[0] || 0);
      const limit = Number(this.params[1] || 1000);
      return (this.tables.warehouses || []).filter((row) => Number(row.id) > afterId).sort((a, b) => Number(a.id) - Number(b.id)).slice(0, limit);
    }
    if (normalized.startsWith('select k,count,updated_at from public_api_throttle')) {
      const afterKey = String(this.params[0] || '');
      const limit = Number(this.params[1] || 1000);
      return (this.tables.public_api_throttle || []).filter((row) => String(row.k) > afterKey).sort((a, b) => String(a.k).localeCompare(String(b.k))).slice(0, limit);
    }
    throw new Error(`Unhandled SQL: ${this.sql}`);
  }
}

class FakeDB {
  constructor(private tables: TableMap) {}

  prepare(sql: string) {
    return new FakeStatement(this.tables, sql);
  }
}

function chunkedTextStream(text: string, chunkSize: number) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        controller.enqueue(bytes.slice(offset, offset + chunkSize));
      }
      controller.close();
    },
  });
}

describe('backup stream helper', () => {
  it('streams valid backup json with manifest and integrity hashes', async () => {
    const db = new FakeDB({
      warehouses: [
        { id: 1, name: '仓库A', created_at: '2026-04-01 00:00:00' },
        { id: 2, name: '仓库B', created_at: '2026-04-02 00:00:00' },
      ],
      public_api_throttle: [
        { k: 'pc:1', count: 3, updated_at: '2026-04-03 00:00:00' },
        { k: 'pc:2', count: 4, updated_at: '2026-04-03 01:00:00' },
      ],
    }) as any;

    const result = await createBackupJsonStream(db, { includeTables: ['warehouses', 'public_api_throttle'], pageSize: 1, actor: 'tester', reason: 'unit' });
    const text = await new Response(result.stream).text();
    const metadata = await readBackupEnvelopeMetadataFromStream(new Response(text).body as ReadableStream<Uint8Array>);
    let streamedRows = 0;
    for await (const row of iterBackupRowsFromStream(new Response(text).body as ReadableStream<Uint8Array>)) {
      expect(row.table === 'warehouses' || row.table === 'public_api_throttle').toBe(true);
      streamedRows += 1;
    }
    const parsed = JSON.parse(text);
    const validation = await validateBackupEnvelope(parsed);

    expect(parsed.version).toBe('inventory-cf-backup-v3');
    expect(parsed.meta.actor).toBe('tester');
    expect(parsed.tables.warehouses).toHaveLength(2);
    expect(parsed.tables.public_api_throttle).toHaveLength(2);
    expect(parsed.stats.warehouses.rows).toBe(2);
    expect(parsed.stats.public_api_throttle.rows).toBe(2);
    expect(parsed.manifest.table_count).toBe(2);
    expect(parsed.manifest.total_rows).toBe(4);
    expect(parsed.manifest.tables.warehouses.rows).toBe(2);
    expect(parsed.integrity.table_count).toBe(2);
    expect(typeof parsed.integrity.manifest_sha256).toBe('string');
    expect(parsed.integrity.manifest_sha256).toHaveLength(64);
    expect(metadata.version).toBe(parsed.version);
    expect(metadata.manifest.total_rows).toBe(4);
    expect(metadata.integrity.table_chain_sha256).toBe(parsed.integrity.table_chain_sha256);
    expect(streamedRows).toBe(4);
    expect(validation.ok).toBe(true);
    expect(validation.issues.filter((item) => item.severity === 'error')).toHaveLength(0);
  });

  it('iterates rows when JSON row objects span stream chunks', async () => {
    const text = JSON.stringify({
      version: 'inventory-cf-backup-v3',
      tables: {
        warehouses: [
          { id: 1, name: 'A'.repeat(200), created_at: '2026-04-01 00:00:00' },
          { id: 2, name: 'B'.repeat(200), created_at: '2026-04-02 00:00:00' },
        ],
        public_api_throttle: [
          { k: 'pc:1', count: 3, updated_at: '2026-04-03 00:00:00' },
          { k: 'pc:2', count: 4, updated_at: '2026-04-03 01:00:00' },
        ],
      },
    });
    const counts: Record<string, number> = {};

    for await (const row of iterBackupRowsFromStream(chunkedTextStream(text, 17))) {
      counts[row.table] = (counts[row.table] || 0) + 1;
      expect(JSON.parse(row.rowText)).toBeTruthy();
    }

    expect(counts).toEqual({ warehouses: 2, public_api_throttle: 2 });
  });
});
