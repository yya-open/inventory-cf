import { describe, expect, it } from 'vitest';
import { buildRepairResultSummary } from '../functions/api/services/ops-tools';

describe('e2e system ops smoke', () => {
  it('builds readable scan and repair summaries', () => {
    expect(buildRepairResultSummary('scan_all', { total_problem_count: 2, affected_rows: 12 })).toContain('2 类问题');
    expect(buildRepairResultSummary('repair_dictionary_counters', { rows: 8 })).toContain('8 行');
  });
});
