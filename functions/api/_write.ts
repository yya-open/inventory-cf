/**
 * Write helpers: D1-safe "transaction" (db.batch), conditional changes gating,
 * and a rollback guard pattern.
 *
 * Why guard? In D1/SQLite, we often do: UPDATE ...; INSERT ... WHERE changes()>0.
 * If any step fails, the whole batch is rolled back. But for complex multi-step writes,
 * a final guard can ensure all expected rows were written; otherwise we intentionally
 * throw to trigger rollback.
 */

export function isGuardRollbackError(e: any): boolean {
  const msg = String(e?.message || e || "");
  return msg.includes("JSON path error") || msg.includes("json_extract") && msg.includes("JSON");
}

/**
 * Create a guard statement that will throw a JSON path error (to rollback) when the count doesn't match.
 */
export function guardCountInTable(
  db: D1Database,
  table: string,
  col: string,
  values: any[],
  expected: number
): D1PreparedStatement {
  const ph = values.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT CASE
         WHEN (SELECT COUNT(*) FROM ${table} WHERE ${col} IN (${ph})) = ?
         THEN 1
         ELSE json_extract('{"a":1}', '$[')
       END AS ok`
    )
    .bind(...values, expected);
}

/**
 * Run a D1 batch and convert guard rollback into a user-friendly Response.
 */
export async function runBatchWithGuard(
  db: D1Database,
  stmts: D1PreparedStatement[],
  guardMessage: string
): Promise<{ ok: true; results: any } | { ok: false; response: Response }> {
  try {
    const results = await db.batch(stmts);
    return { ok: true, results };
  } catch (e: any) {
    if (isGuardRollbackError(e)) {
      return { ok: false, response: Response.json({ ok: false, message: guardMessage }, { status: 409 }) };
    }
    throw e;
  }
}

