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

  it('includes scanner mode default flag', () => {
    const data = normalizeSystemSettings({ public_inventory_scanner_mode_default: '0' as any });
    expect(data.public_inventory_scanner_mode_default).toBe(false);
  });
});
