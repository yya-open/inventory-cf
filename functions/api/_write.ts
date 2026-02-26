export class GuardRollbackError extends Error {
  constructor(message = "GUARD_ROLLBACK") {
    super(message);
    this.name = "GuardRollbackError";
  }
}

export function isGuardRollback(e: any) {
  const msg = String(e?.message || "");
  // D1 surfaces sqlite JSON path errors like this when we purposely trigger rollback using json_extract(...,'$[')
  return msg.includes("JSON path error");
}

export async function runBatchWithGuard(DB: D1Database, stmts: D1PreparedStatement[]) {
  try {
    await DB.batch(stmts);
    return { ok: true as const };
  } catch (e: any) {
    if (isGuardRollback(e)) {
      throw new GuardRollbackError();
    }
    throw e;
  }
}

// Generate a stable token for idempotency use (tx_no / ref_no suffix).
export function safeToken(input: string) {
  const s = String(input ?? "").trim();
  return s
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_\-:.]/g, "_")
    .slice(0, 60); // keep tx_no reasonably short
}
