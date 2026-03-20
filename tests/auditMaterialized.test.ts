import { describe, expect, it } from 'vitest';
import { materializeAuditFields } from '../functions/api/_audit';

describe('audit materialized fields', () => {
  it('extracts target name/code and summary from payload', () => {
    const row = materializeAuditFields('PC_ASSET_UPDATE', 'pc_assets', 12, {
      after: { name: '电脑A', asset_code: 'PC-001', employee_name: '张三' },
      reason: '配置升级',
    });
    expect(row.target_name).toBe('电脑A');
    expect(row.target_code).toBe('PC-001');
    expect(row.summary_text).toBe('配置升级');
    expect(row.search_text_norm).toContain('pc_asset_update');
    expect(row.search_text_norm).toContain('电脑a');
  });
});
