import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import {
  GUARD_ROLLBACK_TOKEN,
  GuardRollbackError,
  guardRowCountSql,
  guardSql,
  isGuardRollback,
  runBatchWithGuard,
} from '../functions/api/_write';

/**
 * These tests execute the guard SQL against a real SQLite engine on purpose.
 *
 * The previous guard idiom — `json_extract('{"a":1}', '$[')` — read correctly but
 * had silently stopped raising: modern SQLite tolerates unterminated array
 * subscripts and returns NULL, so every guarded batch in this codebase committed
 * partial writes instead of rolling back. A source-text assertion would have
 * passed the whole time. Only running the expression catches that class of rot,
 * so if a future SQLite makes the current expression lenient too, these fail.
 */

function db() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE tx (tx_no TEXT PRIMARY KEY, qty INTEGER NOT NULL)`);
  return raw;
}

/** Executes one statement the way D1 does: results are materialized, so a SELECT that errors throws. */
function exec(raw: DatabaseSync, sql: string, binds: unknown[] = []) {
  const stmt = raw.prepare(sql);
  return /^\s*SELECT/i.test(sql) ? stmt.all(...(binds as never[])) : stmt.run(...(binds as never[]));
}

/** Minimal D1 stand-in: one transaction per batch, any statement error rolls the whole thing back. */
function fakeD1(raw: DatabaseSync) {
  return {
    prepare(sql: string) {
      const binds: unknown[] = [];
      return { sql, binds, bind: (...args: unknown[]) => (binds.push(...args), { sql, binds }) };
    },
    async batch(stmts: { sql: string; binds: unknown[] }[]) {
      raw.exec('BEGIN');
      try {
        const results = stmts.map((s) => exec(raw, s.sql, s.binds));
        raw.exec('COMMIT');
        return results;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
}

describe('batch write guard', () => {
  it('passes through without error when the guarded condition holds', () => {
    const raw = db();
    expect(exec(raw, guardSql('1 = 1'))).toEqual([{ guard_ok: 1 }]);
  });

  it('raises when the guarded condition fails', () => {
    const raw = db();
    expect(() => exec(raw, guardSql('1 = 0'))).toThrow();
  });

  it('surfaces the rollback token in the engine error so matching never depends on sqlite wording', () => {
    const raw = db();
    let caught: unknown = null;
    try {
      exec(raw, guardSql('1 = 0'));
    } catch (e) {
      caught = e;
    }

    expect(caught).not.toBeNull();
    expect(String((caught as Error).message)).toContain(GUARD_ROLLBACK_TOKEN);
    expect(isGuardRollback(caught)).toBe(true);
  });

  it('does not evaluate the failing branch when the condition holds', () => {
    const raw = db();
    // A guard whose condition is satisfied must never raise, even though the ELSE
    // branch is an expression that always errors when evaluated.
    expect(() => exec(raw, guardSql('(SELECT COUNT(*) FROM tx) = 0'))).not.toThrow();
  });

  it('guardRowCountSql accepts the expected row count and rejects a mismatch', () => {
    const raw = db();
    exec(raw, `INSERT INTO tx (tx_no, qty) VALUES ('A', 1), ('B', 2)`);

    const sql = guardRowCountSql('tx', 'tx_no', 2);
    expect(exec(raw, sql, ['A', 'B', 2])).toEqual([{ guard_ok: 1 }]);
    // 'C' was never written, so only 2 of the 3 keys resolve: the guard must trip.
    expect(() => exec(raw, guardRowCountSql('tx', 'tx_no', 3), ['A', 'B', 'C', 3])).toThrow();
  });

  it('guardRowCountSql binds keys positionally before the expected count', () => {
    const raw = db();
    exec(raw, `INSERT INTO tx (tx_no, qty) VALUES ('A', 1)`);

    // Swapping the documented bind order must not silently satisfy the guard.
    expect(() => exec(raw, guardRowCountSql('tx', 'tx_no', 1), [1, 'A'])).toThrow();
  });

  it('rolls the whole batch back when a trailing guard trips', async () => {
    const raw = db();
    const DB = fakeD1(raw);

    await expect(
      runBatchWithGuard(DB, [
        DB.prepare(`INSERT INTO tx (tx_no, qty) VALUES (?, ?)`).bind('A', 1),
        DB.prepare(`INSERT INTO tx (tx_no, qty) VALUES (?, ?)`).bind('B', 2),
        // Claims three rows exist while only two were written.
        DB.prepare(guardRowCountSql('tx', 'tx_no', 3)).bind('A', 'B', 'C', 3),
      ]),
    ).rejects.toBeInstanceOf(GuardRollbackError);

    expect(exec(raw, `SELECT COUNT(*) AS c FROM tx`)).toEqual([{ c: 0 }]);
  });

  it('commits every statement when the guard is satisfied', async () => {
    const raw = db();
    const DB = fakeD1(raw);

    await runBatchWithGuard(DB, [
      DB.prepare(`INSERT INTO tx (tx_no, qty) VALUES (?, ?)`).bind('A', 1),
      DB.prepare(`INSERT INTO tx (tx_no, qty) VALUES (?, ?)`).bind('B', 2),
      DB.prepare(guardRowCountSql('tx', 'tx_no', 2)).bind('A', 'B', 2),
    ]);

    expect(exec(raw, `SELECT COUNT(*) AS c FROM tx`)).toEqual([{ c: 2 }]);
  });

  it('rethrows unrelated failures instead of reporting them as a guard conflict', async () => {
    const broken = {
      async batch() {
        throw new Error('D1_ERROR: no such table: tx');
      },
    } as unknown as D1Database;

    await expect(runBatchWithGuard(broken, [])).rejects.not.toBeInstanceOf(GuardRollbackError);
    expect(isGuardRollback(new Error('D1_ERROR: no such table: tx'))).toBe(false);
    expect(isGuardRollback(new Error('bad JSON path: \'$.somewhere\''))).toBe(false);
    expect(isGuardRollback(null)).toBe(false);
    expect(isGuardRollback(undefined)).toBe(false);
  });

  it('does not rely on json paths this sqlite treats as valid', () => {
    const raw = db();
    // Paths the old guard used. Documented here as executable evidence of why the
    // idiom was replaced, and as a tripwire if the guard ever regresses onto one.
    const lenient = ["'$['", "'$[0'", "'$[#'"].filter((path) => {
      try {
        exec(raw, `SELECT json_extract('{"a":1}', ${path}) AS x`);
        return true;
      } catch {
        return false;
      }
    });

    expect(lenient.length).toBeGreaterThan(0);
    for (const path of lenient) {
      expect(guardSql('1 = 0')).not.toContain(path.replaceAll("'", ''));
    }
  });
});
