import { describe, expect, it } from 'vitest';
import { normalizeSystemSettings } from '../functions/api/services/system-settings';

describe('system settings normalization', () => {
  it('keeps settings in safe range', () => {
    const data = normalizeSystemSettings({
      ui_default_page_size: 999,
      public_inventory_cooldown_seconds: 1,
      public_inventory_auto_vibrate: '0' as any,
    });
    expect(data.ui_default_page_size).toBe(200);
    expect(data.public_inventory_cooldown_seconds).toBe(5);
    expect(data.public_inventory_auto_vibrate).toBe(false);
  });

  it('maps legacy scanner flag to new scan mode', () => {
    const data = normalizeSystemSettings({ public_inventory_scanner_mode_default: '0' as any } as any);
    expect(data.public_inventory_scan_mode_default).toBe('manual');
  });

  it('accepts camera scan mode', () => {
    const data = normalizeSystemSettings({ public_inventory_scan_mode_default: 'camera' as any });
    expect(data.public_inventory_scan_mode_default).toBe('camera');
  });
});


  it('normalizes dictionary arrays and archive policy', () => {
    const data = normalizeSystemSettings({
      asset_allow_physical_delete: '0' as any,
      asset_archive_reason_options: '停用归档\n测试数据归档\n停用归档' as any,
      dictionary_department_options: ['研发部', '研发部', '行政部'] as any,
    } as any);
    expect(data.asset_allow_physical_delete).toBe(false);
    expect(data.asset_archive_reason_options).toEqual(['停用归档', '测试数据归档']);
    expect(data.dictionary_department_options).toEqual(['研发部', '行政部']);
  });
