import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
import { ensurePcSchema, must, optional } from './_pc';
import { createPcInRecord } from './services/asset-write';

type Item = {
  brand: string;
  serial_no: string;
  model: string;
  manufacture_date?: string;
  warranty_end?: string;
  disk_capacity?: string;
  memory_size?: string;
  remark?: string;
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuth(env, request, 'operator');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    await ensurePcSchema(env.DB);

    const body = await request.json();
    const items: Item[] = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return Response.json({ ok: false, message: 'items 不能为空' }, { status: 400 });

    let success = 0;
    const errors: { row: number; message: string }[] = [];
    const seenSerial = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      try {
        const it: any = items[i] || {};
        const brand = must(it?.brand, '品牌', 120);
        const serial_no = must(it?.serial_no, '序列号', 120);
        const model = must(it?.model, '型号', 160);
        const snKey = String(serial_no || '').trim();
        if (seenSerial.has(snKey)) throw new Error(`序列号重复：${snKey}`);
        seenSerial.add(snKey);

        const manufacture_date = must(it?.manufacture_date, '出厂时间', 40);
        const warranty_end = optional(it?.warranty_end, 40);
        const disk_capacity = optional(it?.disk_capacity, 40);
        const memory_size = optional(it?.memory_size, 40);
        const remark = optional(it?.remark, 2000);

        await createPcInRecord(env.DB, {
          brand,
          serial_no,
          model,
          manufacture_date,
          warranty_end,
          disk_capacity,
          memory_size,
          remark,
        }, user.username);

        waitUntil(logAudit(env.DB, request, user, 'pc_in_batch', 'pc_assets', serial_no, { serial_no, brand, model }).catch(() => {}));
        success++;
      } catch (e: any) {
        errors.push({ row: i + 2, message: e?.message || '导入失败' });
      }
    }

    return Response.json({ ok: true, success, failed: errors.length, errors });
  } catch (e: any) {
    return errorResponse(e);
  }
};
