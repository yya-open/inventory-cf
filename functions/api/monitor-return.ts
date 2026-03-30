import { optional } from './_pc';
import { createMonitorMovementHandler } from './services/monitor-movement-api';

export const onRequestPost = createMonitorMovementHandler({
  type: 'RETURN',
  txPrefix: 'MONRET',
  successMessage: '归还成功',
  prepare: ({ body, asset }) => {
    const toLocationId = Number(body?.location_id || body?.to_location_id || 0) || null;
    const remark = optional(body?.remark, 1000);
    return {
      toLocationId,
      employeeNo: asset.employee_no,
      department: asset.department,
      employeeName: asset.employee_name,
      isEmployed: asset.is_employed,
      remark,
      auditPayload: { to_location_id: toLocationId, remark },
    };
  },
});
