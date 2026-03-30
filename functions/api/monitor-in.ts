import { optional } from './_pc';
import { createMonitorMovementHandler } from './services/monitor-movement-api';

export const onRequestPost = createMonitorMovementHandler({
  type: 'IN',
  txPrefix: 'MONIN',
  successMessage: '入库成功',
  prepare: ({ body }) => {
    const toLocationId = Number(body?.location_id || body?.to_location_id || 0) || null;
    const remark = optional(body?.remark, 1000);
    return {
      toLocationId,
      remark,
      auditPayload: { to_location_id: toLocationId, remark },
    };
  },
});
