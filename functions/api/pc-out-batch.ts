import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
import {
  ensurePcSchemaIfAllowed,
  must,
  optional,
  pcOutNo,
  isInStockStatus,
  toAssetStatusAfterOut,
} from './_pc';
import { applyPcOut, normalizePcSerialNo } from './services/asset-write';
import { createTiming } from './_timing';
import { assertDateText, assertEmployeeNo, getDataQualitySettings, trimRemarkByRule } from './services/data-quality';
import { assertDepartmentDictionaryValue } from './services/master-data';
import { buildChildWriteNo } from './services/write-idempotency';

type Item = {
  employee_no: string;
  department: string;
  employee_name: string;
  is_employed?: string;
  asset_id?: number;
  serial_no?: string;
  config_date?: string;
  remark?: string;
};

function placeholders(count: number) {
  return Array.from({ length: count }, () => '?').join(',');
}

async function loadExistingOutNos(db: D1Database, nos: string[]) {
  if (!nos.length) return new Set<string>();
  const rows = await db.prepare(`SELECT out_no FROM pc_out WHERE out_no IN (${placeholders(nos.length)})`).bind(...nos).all<any>();
  return new Set((rows.results || []).map((row: any) => String(row?.out_no || '')));
}

async function loadPcAssetsForBatch(db: D1Database, items: Item[]) {
  const idList = [...new Set(items.map((it) => Number(it?.asset_id || 0)).filter((id) => id > 0))];
  const serialList = [...new Set(items.map((it) => normalizePcSerialNo(it?.serial_no)).filter(Boolean))];
  const byId = new Map<number, any>();
  const bySerial = new Map<string, any>();
  if (idList.length) {
    const rows = await db.prepare(`SELECT * FROM pc_assets WHERE id IN (${placeholders(idList.length)})`).bind(...idList).all<any>();
    for (const row of rows.results || []) {
      byId.set(Number(row.id), row);
      bySerial.set(normalizePcSerialNo(row.serial_no), row);
    }
  }
  if (serialList.length) {
    const rows = await db.prepare(`SELECT * FROM pc_assets WHERE UPPER(TRIM(serial_no)) IN (${placeholders(serialList.length)})`).bind(...serialList).all<any>();
    for (const row of rows.results || []) {
      byId.set(Number(row.id), row);
      bySerial.set(normalizePcSerialNo(row.serial_no), row);
    }
  }
  return { byId, bySerial };
}

function resolveBatchAsset(maps: { byId: Map<number, any>; bySerial: Map<string, any> }, item: Item) {
  const assetId = Number(item?.asset_id || 0);
  if (assetId > 0 && maps.byId.has(assetId)) return maps.byId.get(assetId);
  const serial = normalizePcSerialNo(item?.serial_no);
  if (serial && maps.bySerial.has(serial)) return maps.bySerial.get(serial);
  return null;
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

    const outNos = items.map((_, index) => buildChildWriteNo('PCOUT', pcOutNo, body?.client_request_id, index + 1).no);
    const [existingNos, assetMaps] = await Promise.all([
      loadExistingOutNos(env.DB, outNos),
      loadPcAssetsForBatch(env.DB, items),
    ]);

    let success = 0;
    let duplicated = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const it: any = items[i] || {};
        const no = outNos[i];
        if (existingNos.has(no)) {
          success++;
          duplicated++;
          continue;
        }

        const employee_no = assertEmployeeNo(must(it?.employee_no, '员工工号', 60), quality.employeeNoPattern);
        const department = must(it?.department, '部门', 120);
        await assertDepartmentDictionaryValue(env.DB, department, '领用部门');
        const employee_name = must(it?.employee_name, '员工姓名', 120);
        const is_employed = optional(it?.is_employed, 40);
        const config_date = assertDateText(optional(it?.config_date, 40), '配置日期');
        const remark = trimRemarkByRule(optional(it?.remark, 2000), quality.remarkMaxLength);

        const asset = resolveBatchAsset(assetMaps, it);
        if (!asset) throw new Error('未找到该电脑资产（请检查序列号/asset_id）');
        if (!isInStockStatus(asset.status)) throw new Error('该电脑当前不是“在库”，无法出库');

        const afterStatus = toAssetStatusAfterOut();
        await applyPcOut({
          db: env.DB,
          outNo: no,
          asset,
          employeeNo: employee_no,
          department,
          employeeName: employee_name,
          isEmployed: is_employed,
          configDate: config_date,
          remark,
          createdBy: user.username,
          statusAfter: afterStatus,
        });

        waitUntil(logAudit(env.DB, request, user, 'PC_OUT_BATCH', 'pc_out', no, {
          asset_id: asset.id,
          serial_no: asset.serial_no,
          employee_no,
          department,
          employee_name,
          status_after: afterStatus,
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
