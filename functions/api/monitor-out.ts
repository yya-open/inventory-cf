import { must, optional } from './_pc';
import { createMonitorMovementHandler } from './services/monitor-movement-api';

export const onRequestPost = createMonitorMovementHandler({
  type: 'OUT',
  txPrefix: 'MONOUT',
  successMessage: '出库成功',
  prepare: async ({ env, body }) => {
    const employeeNo = must(body?.employee_no, '工号', 80);
    const employeeName = must(body?.employee_name, '姓名', 120);
    const department = must(body?.department, '部门', 120);
    const isEmployed = optional(body?.is_employed, 20);
    const toLocationId = Number(body?.location_id || body?.to_location_id || 0) || null;
    const remark = optional(body?.remark, 1000);
    return {
      employeeNo,
      employeeName,
      department,
      isEmployed,
      toLocationId,
      remark,
      auditPayload: {
        employee_no: employeeNo,
        employee_name: employeeName,
        department,
        to_location_id: toLocationId,
        remark,
      },
    };
  },
});
