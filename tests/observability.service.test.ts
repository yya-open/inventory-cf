import { describe, expect, it } from 'vitest';
import { clampRetentionDays, percentile, summarizeRouteDurations } from '../functions/api/services/observability';

describe('observability helpers', () => {
  it('clamps retention days into safe range', () => {
    expect(clampRetentionDays('7', 30)).toBe(7);
    expect(clampRetentionDays('0', 30)).toBe(1);
    expect(clampRetentionDays('999', 30)).toBe(365);
    expect(clampRetentionDays('bad', 30)).toBe(30);
  });

  it('summarizes route durations and percentile', () => {
    const summary = summarizeRouteDurations([{ duration_ms: 100 }, { duration_ms: 1800 }, { duration_ms: 2400 }]);
    expect(summary.slow_route_count).toBe(2);
    expect(summary.avg_duration_ms).toBeCloseTo(1433.3, 1);
    expect(summary.p95_duration_ms).toBe(2400);
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
  });
});
