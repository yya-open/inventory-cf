export class GuardRollbackError extends Error {
    constructor(message = "GUARD_ROLLBACK") {
        super(message);
        this.name = "GuardRollbackError";
    }
}
export function isGuardRollback(e) {
    const msg = String(e?.message || "");
    // D1 surfaces sqlite JSON path errors like this when we purposely trigger rollback using json_extract(...,'$[')
    return msg.includes("JSON path error");
}
export async function runBatchWithGuard(DB, stmts) {
    try {
        await DB.batch(stmts);
        return { ok: true };
    }
    catch (e) {
        if (isGuardRollback(e)) {
            throw new GuardRollbackError();
        }
        throw e;
    }
}
// Generate a stable token for idempotency use (tx_no / ref_no suffix).
export function safeToken(input) {
    const s = String(input ?? "").trim();
    return s
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9_\-:.]/g, "_")
        .slice(0, 60); // keep tx_no reasonably short
}
