import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
import { ensurePcSchemaIfAllowed, must, optional, pcInNo } from './_pc';
import { createPcAssetAndInRecord, normalizePcSerialNo } from './services/asset-write';
import { createTiming } from './_timing';
import { assertDateText, getDataQualitySettings, trimRemarkByRule } from './services/data-quality';
import { assertPcBrandDictionaryValue } from './services/master-data';
import { buildWriteNo, findExistingByNo } from './services/write-idempotency';

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string; __timing?: any }> = async ({ env, request, waitUntil }) => {
  const t = env.__timing || createTiming();
  try {
    const user = await t.measure('auth', () => requireAuth(env, request, 'operator'));
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    await t.measure('schema', () => ensurePcSchemaIfAllowed(env.DB, env, new URL(request.url)));

    const body = await t.measure('parse', () => request.json<any>().catch(() => ({} as any)));
    const { no } = buildWriteNo('PCIN', pcInNo, body?.client_request_id);
    const [quality, existing] = await Promise.all([
      t.measure('settings', () => getDataQualitySettings(env.DB)),
      t.measure('idempotency', () => findExistingByNo(env.DB, 'pc_in', 'in_no', no, 'in_no, asset_id')),
    ]);
    if (existing?.in_no) {
      return Response.json({ ok: true, in_no: existing.in_no, asset_id: Number(existing.asset_id || 0) || null, created: false, duplicate: true, message: '入库成功（幂等命中）' });
    }

    const brand = must(body?.brand, '品牌', 120);
    await assertPcBrandDictionaryValue(env.DB, brand, '电脑品牌');
    const serial_no = normalizePcSerialNo(must(body?.serial_no, '序列号', 120));
    const model = must(body?.model, '型号', 160);
    const manufacture_date = assertDateText(must(body?.manufacture_date, '出厂时间', 40), '出厂时间');
    const warranty_end = assertDateText(optional(body?.warranty_end, 40), '保修到期');
    const disk_capacity = optional(body?.disk_capacity, 40);
    const memory_size = optional(body?.memory_size, 40);
    const remark = trimRemarkByRule(optional(body?.remark, 2000), quality.remarkMaxLength);


    const assetId = await createPcAssetAndInRecord({
      db: env.DB,
      inNo: no,
      brand,
      serialNo: serial_no,
      model,
      manufactureDate: manufacture_date,
      warrantyEnd: warranty_end,
      diskCapacity: disk_capacity,
      memorySize: memory_size,
      remark,
      createdBy: user.username,
    });

    waitUntil(logAudit(env.DB, request, user, 'PC_IN', 'pc_in', no, {
      asset_id: assetId,
      brand,
      serial_no,
      model,
      manufacture_date,
      warranty_end,
      disk_capacity,
      memory_size,
      remark,
    }).catch(() => {}));

    return Response.json({ ok: true, in_no: no, asset_id: assetId, created: true, duplicate: false });
  } catch (e: any) {
    return errorResponse(e);
  }
};
