import { describe, expect, it } from 'vitest';
import {
  assertMonitorMovementAllowed,
  monitorMovementAuditAction,
  pcRecycleAuditAction,
  pcStatusAfterRecycle,
} from '../functions/api/services/asset-write';

describe('asset write helpers', () => {
  it('maps recycle action to status and audit action', () => {
    expect(pcStatusAfterRecycle('RETURN')).toBe('IN_STOCK');
    expect(pcStatusAfterRecycle('RECYCLE')).toBe('RECYCLED');
    expect(pcRecycleAuditAction('RETURN')).toBe('PC_RETURN');
    expect(pcRecycleAuditAction('RECYCLE')).toBe('PC_RECYCLE');
  });

  it('maps monitor movement to uppercase audit action', () => {
    expect(monitorMovementAuditAction('IN')).toBe('MONITOR_IN');
    expect(monitorMovementAuditAction('TRANSFER')).toBe('MONITOR_TRANSFER');
  });

  it('blocks invalid monitor movements by status', () => {
    expect(() => assertMonitorMovementAllowed({ status: 'ASSIGNED' }, 'OUT')).toThrow('该显示器当前为已领用状态');
    expect(() => assertMonitorMovementAllowed({ status: 'SCRAPPED' }, 'RETURN')).toThrow('该资产已报废');
    expect(() => assertMonitorMovementAllowed({ status: 'IN_STOCK' }, 'RETURN')).toThrow('该资产当前不是已领用状态');
  });

  it('allows legal monitor movements', () => {
    expect(() => assertMonitorMovementAllowed({ status: 'IN_STOCK' }, 'OUT')).not.toThrow();
    expect(() => assertMonitorMovementAllowed({ status: 'ASSIGNED' }, 'TRANSFER')).not.toThrow();
    expect(() => assertMonitorMovementAllowed({ status: 'RECYCLED' }, 'IN')).not.toThrow();
  });
});
