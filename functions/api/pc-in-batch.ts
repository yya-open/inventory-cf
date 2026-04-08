import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
import { ensurePcSchemaIfAllowed, must, optional, pcInNo } from './_pc';
import { createPcAssetAndInRecord, normalizePcSerialNo } from './services/asset-write';
import { createTiming } from './_timing';
import { assertDateText, getDataQualitySettings, trimRemarkByRule } from './services/data-quality';
import { assertPcBrandDictionaryValue } from './services/master-data';
import { buildChildWriteNo } from './services/write-idempotency';

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

function placeholders(count: number) {
  return Array.from({ length: count }, () => '?').join(',');
}

async function loadExistingInNos(db: D1Database, nos: string[]) {
  if (!nos.length) return new Set<string>();
  const rows = await db.prepare(`SELECT in_no FROM pc_in WHERE in_no IN (${placeholders(nos.length)})`).bind(...nos).all<any>();
  return new Set((rows.results || []).map((row: any) => String(row?.in_no || '')));
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string; __timing?: any }> = async ({ env, request, waitUntil }) => {
  const t = env.__timing || createTiming();
  const url = new URL(request.url);
  try {
    const user = await t.measure('auth', () => requireAuth(env, request, 'operator'));
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    await t.measure('schema', () => ensurePcSchemaIfAllowed(env.DB, env, url));

    const body = await t.measure('parse', () => request.json<any>().catch(() => ({} as any)));
    const quality = await t.measure('settings', () => getDataQualitySettings(env.DB));
    const items: Item[] = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return Response.json({ ok: false, message: 'items 不能为空' }, { status: 400 });

    const inNos = items.map((_, index) => buildChildWriteNo('PCIN', pcInNo, body?.client_request_id, index + 1).no);
    const existingNos = await loadExistingInNos(env.DB, inNos);

    let success = 0;
    let duplicated = 0;
    const errors: { row: number; message: string }[] = [];
    const seenSerial = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      try {
        const it: any = items[i] || {};
        const no = inNos[i];
        if (existingNos.has(no)) {
          success++;
          duplicated++;
          continue;
        }

        const brand = must(it?.brand, '品牌', 120);
        await assertPcBrandDictionaryValue(env.DB, brand, '电脑品牌');
        const serial_no = normalizePcSerialNo(must(it?.serial_no, '序列号', 120));
        const model = must(it?.model, '型号', 160);
        const snKey = normalizePcSerialNo(serial_no);
        if (seenSerial.has(snKey)) throw new Error(`序列号重复：${snKey}`);
        seenSerial.add(snKey);

        const manufacture_date = assertDateText(must(it?.manufacture_date, '出厂时间', 40), '出厂时间');
        const warranty_end = assertDateText(optional(it?.warranty_end, 40), '保修到期');
        const disk_capacity = optional(it?.disk_capacity, 40);
        const memory_size = optional(it?.memory_size, 40);
        const remark = trimRemarkByRule(optional(it?.remark, 2000), quality.remarkMaxLength);

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

        waitUntil(logAudit(env.DB, request, user, 'PC_IN_BATCH', 'pc_in', no, {
          asset_id: assetId,
          brand,
          serial_no,
          model,
          manufacture_date,
        }).catch(() => {}));
        success++;
      } catch (e: any) {
        errors.push({ row: i + 2, message: e?.message || '导入失败' });
      }
    }

    return Response.json({ ok: true, success, duplicated, failed: errors.length, errors });
  } catch (e: any) {
    return errorResponse(e);
  }
};
