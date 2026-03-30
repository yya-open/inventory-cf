import { normalizeClientRequestId, toDeterministicNo, withChildRequestId } from '../../_idempotency';

export function buildWriteNo(prefix: string, generator: () => string, clientRequestId?: any) {
  const normalized = normalizeClientRequestId(clientRequestId);
  return {
    clientRequestId: normalized,
    no: normalized ? toDeterministicNo(prefix, normalized) : generator(),
  };
}

export function buildChildWriteNo(prefix: string, generator: () => string, clientRequestId: any, child: string | number) {
  const childRequestId = withChildRequestId(clientRequestId, child);
  return buildWriteNo(prefix, generator, childRequestId);
}

export async function findExistingByNo(db: D1Database, table: string, noColumn: string, no: string, select = '*') {
  return db.prepare(`SELECT ${select} FROM ${table} WHERE ${noColumn}=? LIMIT 1`).bind(no).first<any>();
}
