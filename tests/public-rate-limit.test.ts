import { describe, expect, it } from 'vitest';
import { rateLimitPublic } from '../functions/api/services/public-assets';

class FakeStatement {
  private params: any[] = [];

  constructor(private db: FakeDB, private sql: string) {}

  bind(...params: any[]) {
    this.params = params;
    return this;
  }

  async run() {
    this.db.execute(this.sql, this.params);
    return { success: true, meta: { changes: 1 } } as any;
  }

  async first<T = any>() {
    return this.db.execute(this.sql, this.params) as T;
  }
}

class FakeDB {
  private buckets = new Map<string, number>();

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  execute(sql: string, params: any[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.startsWith('insert into public_api_throttle')) {
      const key = String(params[0]);
      this.buckets.set(key, (this.buckets.get(key) || 0) + 1);
      return null;
    }
    if (normalized.startsWith('select count, updated_at from public_api_throttle')) {
      return { count: this.buckets.get(String(params[0])) || 0, updated_at: '2026-07-22 12:00:00' };
    }
    if (normalized.startsWith('delete from public_api_throttle')) return null;
    throw new Error(`Unhandled SQL: ${sql}`);
  }

  countFor(prefix: string) {
    return Array.from(this.buckets.entries())
      .filter(([key]) => key.startsWith(prefix))
      .reduce((total, [, count]) => total + count, 0);
  }
}

function requestFor(ip: string) {
  return new Request('https://example.com/api/public/pc-asset?id=1', {
    headers: { 'CF-Connecting-IP': ip },
  });
}

describe('public source rate limiting', () => {
  it('caps one source across changing asset subjects', async () => {
    const db = new FakeDB();
    const request = requestFor('203.0.113.10');

    await rateLimitPublic(db as any, request, 'public_pc_asset', 'asset-1', 1, { sourceLimitPerMinute: 2 });
    await rateLimitPublic(db as any, request, 'public_pc_asset', 'asset-2', 1, { sourceLimitPerMinute: 2 });
    await expect(rateLimitPublic(db as any, request, 'public_pc_asset', 'asset-3', 1, { sourceLimitPerMinute: 2 }))
      .rejects.toMatchObject({ status: 429 });

    expect(db.countFor('public_pc_asset|source|203.0.113.10|')).toBe(3);
    expect(db.countFor('public_pc_asset|subject|')).toBe(2);
  });
});
