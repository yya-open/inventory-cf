/**
 * Idempotency helpers
 * - client_request_id: client-generated stable identifier for a write request
 * - We store it in stock_tx.ref_no as `rid:<client_request_id>`
 * - A UNIQUE partial index on ref_no LIKE 'rid:%' ensures de-duplication.
 */

export function normalizeClientRequestId(v: any): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s.length > 64) return null;
  // allow uuid-like tokens and simple ids
  if (!/^[a-zA-Z0-9:_\-]+$/.test(s)) return null;
  return s;
}

export function toRidRefNo(id: string) {
  return `rid:${id}`;
}

export function isUniqueConstraintError(e: any) {
  const m = String(e?.message || e || "");
  return m.includes("UNIQUE constraint failed") || m.includes("constraint failed") || m.includes("SQLITE_CONSTRAINT");
}
