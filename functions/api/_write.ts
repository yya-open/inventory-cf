export class GuardRollbackError extends Error {
  constructor(message = "GUARD_ROLLBACK") {
    super(message);
    this.name = "GuardRollbackError";
  }
}

/**
 * SQLite exposes no RAISE() outside triggers, so a guard row aborts a D1 batch by
 * evaluating an expression that errors. The previous idiom was
 * `json_extract('{"a":1}', '$[')`, which relied on an unterminated array
 * subscript being a syntax error. Modern SQLite (verified on 3.53.1) tolerates
 * `'$['`, `'$[0'` and `'$[#'` and returns NULL instead — which silently turned
 * every guard in this codebase into a no-op that committed partial batches.
 *
 * A path that does not begin with `'$'` has always been invalid, and SQLite
 * echoes the offending path back in the error message, so the guard smuggles its
 * own token out through it and we match on that instead of on SQLite's wording:
 *   older sqlite: JSON path error near 'GUARD_ROLLBACK__D1'
 *   newer sqlite: bad JSON path: 'GUARD_ROLLBACK__D1'
 */
export const GUARD_ROLLBACK_TOKEN = 'GUARD_ROLLBACK__D1';

const GUARD_ROLLBACK_EXPR = `json_extract('{}', '${GUARD_ROLLBACK_TOKEN}')`;

/**
 * Guard row for `runBatchWithGuard`: commits when `condition` is true, otherwise
 * errors and rolls the whole batch back. `condition` is trusted SQL owned by the
 * caller — pass user data through bound `?` placeholders, never by interpolation.
 */
export function guardSql(condition: string) {
  return `SELECT CASE WHEN ${condition} THEN 1 ELSE ${GUARD_ROLLBACK_EXPR} END AS guard_ok`;
}

/**
 * Guard for the common "these keys resolve to exactly N rows" check.
 * Bind `...keys, expectedCount`.
 */
export function guardRowCountSql(table: string, column: string, keyCount: number) {
  const placeholders = new Array(keyCount).fill('?').join(',');
  return guardSql(`(SELECT COUNT(*) FROM ${table} WHERE ${column} IN (${placeholders})) = ?`);
}

export function isGuardRollback(e: unknown) {
  const msg = String((e as { message?: unknown } | null | undefined)?.message ?? '');
  return msg.includes(GUARD_ROLLBACK_TOKEN);
}

export async function runBatchWithGuard(DB: D1Database, stmts: D1PreparedStatement[]) {
  try {
    // 返回逐条语句的结果，便于调用方统计 changes（如删除条数）；旧调用方忽略返回值即可。
    const results = await DB.batch(stmts);
    return { ok: true as const, results };
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
