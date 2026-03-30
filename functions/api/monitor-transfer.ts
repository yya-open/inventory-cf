import { optional } from './_pc';
import { createMonitorMovementHandler } from './services/monitor-movement-api';

export const onRequestPost = createMonitorMovementHandler({
  type: 'TRANSFER',
  txPrefix: 'MONTR',
  successMessage: '调拨成功',
  prepare: ({ body, asset }) => {
    const toLocationId = Number(body?.to_location_id || body?.location_id || 0);
    if (!toLocationId) throw Object.assign(new Error('请选择目标位置'), { status: 400 });
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
