import { must } from './_pc';
import { createMonitorMovementHandler } from './services/monitor-movement-api';

export const onRequestPost = createMonitorMovementHandler({
  type: 'SCRAP',
  txPrefix: 'MONSCRAP',
  successMessage: '报废成功',
  prepare: ({ body, asset }) => {
    const reason = must(body?.reason || body?.remark, '报废原因', 1000);
    return {
      employeeNo: asset.employee_no,
      department: asset.department,
      employeeName: asset.employee_name,
      isEmployed: asset.is_employed,
      remark: reason,
      auditPayload: { reason },
    };
  },
});
