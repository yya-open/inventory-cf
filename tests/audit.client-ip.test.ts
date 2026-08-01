import { describe, expect, it } from 'vitest';
import { logAudit } from '../functions/api/_audit';
import { getAuditClientIp, getClientIp } from '../functions/api/services/client-ip';
import { getRequestClientMeta } from '../functions/api/services/asset-write';
import type { AuthUser } from '../functions/_auth';

const AUDIT_USER: AuthUser = { id: 1, username: 'alice', role: 'admin' };

// CaptureAuditDb implements only the D1 surface logAudit touches (prepare/batch); the DB
// interface is far wider, so narrow via one named boundary cast rather than a bare `any`.
const asDb = (db: CaptureAuditDb) => db as unknown as D1Database;

function requestWith(headers: Record<string, string>) {
  return new Request('https://example.com/api/monitor-assets-bulk', { method: 'POST', headers });
}

// audit_log INSERT binds columns in this order; provenance IP lands at index 6.
const AUDIT_IP_BIND_INDEX = 6;

// Captures the bind params of the audit_log INSERT so we can assert the persisted IP.
// Any other prepare()/first()/all() (e.g. the best-effort cleanup pass) resolves benignly
// so logAudit's real insert path runs to completion instead of being swallowed.
class CaptureAuditDb {
  auditInsertBinds: unknown[] | null = null;

  prepare(sql: string) {
    const isAuditInsert = sql.includes('INSERT INTO audit_log');
    const capture = (params: unknown[]) => {
      if (isAuditInsert) this.auditInsertBinds = params;
    };
    return {
      bind: (...params: unknown[]) => ({
        run: async () => {
          capture(params);
          return { meta: { changes: 1 } };
        },
        first: async () => null,
        all: async () => ({ results: [] }),
      }),
      run: async () => ({ meta: { changes: 0 } }),
      first: async () => null,
      all: async () => ({ results: [] }),
    };
  }

  async batch(statements: Array<{ run: () => Promise<unknown> }>) {
    return Promise.all(statements.map((statement) => statement.run()));
  }
}

// Provenance IPs feed audit_log / monitor_tx / inventory-log rows, all recorded from the request.
// A caller-controlled X-Forwarded-For must never reach those rows: only the Cloudflare edge header is trusted,
// and an unknown origin is stored as '' (not a real-looking placeholder address).
describe('audit provenance IP only trusts the Cloudflare edge header', () => {
  it('records CF-Connecting-IP in the audit_log row', async () => {
    const db = new CaptureAuditDb();
    await logAudit(
      asDb(db),
      requestWith({ 'CF-Connecting-IP': '203.0.113.9' }),
      AUDIT_USER,
      'MONITOR_ASSET_OWNER_BATCH',
      'monitor_assets',
      '5',
      { count: 1 },
    );
    expect(db.auditInsertBinds).not.toBeNull();
    expect(db.auditInsertBinds![AUDIT_IP_BIND_INDEX]).toBe('203.0.113.9');
  });

  it('ignores a spoofed X-Forwarded-For and stores empty string for the audit_log row', async () => {
    const db = new CaptureAuditDb();
    await logAudit(
      asDb(db),
      requestWith({ 'X-Forwarded-For': '198.51.100.7, 203.0.113.1' }),
      AUDIT_USER,
      'MONITOR_ASSET_OWNER_BATCH',
      'monitor_assets',
      '5',
      { count: 1 },
    );
    expect(db.auditInsertBinds).not.toBeNull();
    expect(db.auditInsertBinds![AUDIT_IP_BIND_INDEX]).toBe('');
  });

  it('keeps CF-Connecting-IP even when a spoofed X-Forwarded-For is also present', async () => {
    const db = new CaptureAuditDb();
    await logAudit(
      asDb(db),
      requestWith({ 'CF-Connecting-IP': '203.0.113.9', 'X-Forwarded-For': '198.51.100.7' }),
      null,
      'MONITOR_ASSET_OWNER_BATCH',
      'monitor_assets',
      '5',
      { count: 1 },
    );
    expect(db.auditInsertBinds![AUDIT_IP_BIND_INDEX]).toBe('203.0.113.9');
  });
});

describe('provenance helpers vs rate-limit helper', () => {
  it('getAuditClientIp returns the edge IP and ignores X-Forwarded-For', () => {
    expect(getAuditClientIp(requestWith({ 'CF-Connecting-IP': '203.0.113.9' }))).toBe('203.0.113.9');
    expect(getAuditClientIp(requestWith({ 'X-Forwarded-For': '198.51.100.7' }))).toBe('');
    expect(
      getAuditClientIp(requestWith({ 'CF-Connecting-IP': '203.0.113.9', 'X-Forwarded-For': '198.51.100.7' })),
    ).toBe('203.0.113.9');
  });

  it('getRequestClientMeta carries the trusted IP and never the spoofed header', () => {
    expect(getRequestClientMeta(requestWith({ 'CF-Connecting-IP': '203.0.113.9' })).ip).toBe('203.0.113.9');
    expect(getRequestClientMeta(requestWith({ 'X-Forwarded-For': '198.51.100.7' })).ip).toBe('');
  });

  it('audit unknown-origin is empty string while rate-limit still shares the 0.0.0.0 bucket', () => {
    const unknown = requestWith({ 'X-Forwarded-For': '198.51.100.7' });
    expect(getAuditClientIp(unknown)).toBe('');
    expect(getClientIp(unknown)).toBe('0.0.0.0');
  });
});
