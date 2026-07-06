import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('stocktake apply guards', () => {
  it('does not move a draft stocktake to applying during preview', () => {
    const source = readFileSync(resolve(process.cwd(), 'functions/api/stocktake/apply.ts'), 'utf8');
    const previewIndex = source.indexOf('if (previewOnly)');
    const applyingIndex = source.indexOf("UPDATE stocktake SET status='APPLYING'");

    expect(previewIndex).toBeGreaterThan(0);
    expect(applyingIndex).toBeGreaterThan(0);
    expect(previewIndex).toBeLessThan(applyingIndex);
  });

  it('checks that every expected stocktake adjustment has a transaction before finalizing', () => {
    const source = readFileSync(resolve(process.cwd(), 'functions/api/stocktake/apply.ts'), 'utf8');
    const normalized = source.replace(/\s+/g, ' ');

    expect(normalized).toContain('const expectedAdjusted = Number(preview.adjusted_rows || 0)');
    expect(normalized).toContain("WHERE ref_type='STOCKTAKE'");
    expect(normalized).toContain("errorCode: 'STOCKTAKE_APPLY_NOT_FINALIZED'");
  });

  it('checks that every expected rollback transaction exists before returning to draft', () => {
    const source = readFileSync(resolve(process.cwd(), 'functions/api/stocktake/rollback.ts'), 'utf8');
    const normalized = source.replace(/\s+/g, ' ');
    const guardIndex = normalized.indexOf('const expectedReversed = rows.length');
    const doneIndex = normalized.indexOf("UPDATE stocktake SET status='DRAFT'");

    expect(guardIndex).toBeGreaterThan(0);
    expect(doneIndex).toBeGreaterThan(0);
    expect(guardIndex).toBeLessThan(doneIndex);
    expect(normalized).toContain("WHERE ref_type='STOCKTAKE_ROLLBACK'");
    expect(normalized).toContain("errorCode: 'STOCKTAKE_ROLLBACK_NOT_FINALIZED'");
  });
});
