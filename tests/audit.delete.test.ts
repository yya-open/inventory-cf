import { describe, expect, it } from 'vitest';
import { deleteAuditRowsByIds } from '../functions/api/_audit';

class FakeAuditDb {
  batches: number[][] = [];

  prepare(sql: string) {
    return {
      bind: (...params: number[]) => ({
        run: async () => {
          this.batches.push(params);
          return { meta: { changes: params.length }, sql };
        },
      }),
    };
  }
}

describe('audit delete helpers', () => {
  it('splits id deletes into D1-safe batches by default', async () => {
    const db = new FakeAuditDb();
    const ids = Array.from({ length: 113 }, (_value, index) => index + 1);

    const deleted = await deleteAuditRowsByIds(db as any, ids);

    expect(deleted).toBe(113);
    expect(db.batches.map((batch) => batch.length)).toEqual([50, 50, 13]);
  });

  it('clamps oversized requested batches to the D1-safe size', async () => {
    const db = new FakeAuditDb();
    const ids = Array.from({ length: 101 }, (_value, index) => index + 1);

    await deleteAuditRowsByIds(db as any, ids, 500);

    expect(db.batches.map((batch) => batch.length)).toEqual([50, 50, 1]);
  });
});
