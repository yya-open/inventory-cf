import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
import { ensurePcSchema, must, optional } from './_pc';
import { createPcInRecord } from './services/asset-write';

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuth(env, request, 'operator');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    await ensurePcSchema(env.DB);

    const body = await request.json();
    const brand = must(body?.brand, '品牌', 120);
    const serial_no = must(body?.serial_no, '序列号', 120);
    const model = must(body?.model, '型号', 160);
    const manufacture_date = must(body?.manufacture_date, '出厂时间', 40);
    const warranty_end = optional(body?.warranty_end, 40);
    const disk_capacity = optional(body?.disk_capacity, 40);
    const memory_size = optional(body?.memory_size, 40);
    const remark = optional(body?.remark, 2000);

    const result = await createPcInRecord(env.DB, {
      brand,
      serial_no,
      model,
      manufacture_date,
      warranty_end,
      disk_capacity,
      memory_size,
      remark,
    }, user.username);

    waitUntil(
      logAudit(env.DB, request, user, 'PC_IN', 'pc_in', result.in_no, {
        asset_id: result.asset_id,
        brand,
        serial_no,
        model,
        manufacture_date,
        warranty_end,
        disk_capacity,
        memory_size,
        remark,
      }).catch(() => {})
    );

    return Response.json({ ok: true, ...result });
  } catch (e: any) {
    return errorResponse(e);
  }
};
