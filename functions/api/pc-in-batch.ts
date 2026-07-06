import { withErrorHandling } from './_error';
import { logAudit } from './_audit';
import { ensurePcSchemaIfAllowed, must, optional, pcInNo } from './_pc';
import { normalizePcSerialNo } from './services/asset-write';
import { createTiming } from './_timing';
import { assertDateText, getDataQualitySettings, trimRemarkByRule } from './services/data-quality';
import { assertPcBrandDictionaryValue } from './services/master-data';
import { buildChildWriteNo, findExistingByNo } from './services/write-idempotency';
import { assertAssetWarehouseAccess, requireAuthWithDataScope } from './services/data-scope';
import { invalidateAssetListCache } from './services/asset-list-cache';
import { ensureSearchFtsTables } from './services/search-fts';
import { sqlNowStored } from './_time';
import { buildPcAssetSearchText, pcDateTextToUnixTs } from './services/asset-ledger';
import { syncSystemDictionaryUsageCounters } from './services/system-dictionaries';
import { batchFindExistingByNo, batchFindAssetsBySerial } from './services/batch-utils';

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

export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string; __timing?: any }>(async ({ env, request, waitUntil }) => {
  const t = env.__timing || createTiming();
  const url = new URL(request.url);
  const user = await t.measure('auth', () => requireAuthWithDataScope(env, request, 'operator'));
  if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

  await t.measure('schema', () => ensurePcSchemaIfAllowed(env.DB, env, url));
  assertAssetWarehouseAccess(user, '电脑仓', '电脑批量入库');

  const body = await t.measure('parse', () => request.json().catch(() => ({} as any)));
  const quality = await t.measure('settings', () => getDataQualitySettings(env.DB));
  const items: Item[] = Array.isArray(body?.items) ? body.items : [];
  await t.measure('search_fts', () => ensureSearchFtsTables(env.DB, ['pc']));
  if (!items.length) return Response.json({ ok: false, message: 'items 不能为空' }, { status: 400 });

  // 预生成所有幂等号
  const itemNos = items.map((_, i) => {
    const { no } = buildChildWriteNo('PCIN', pcInNo, body?.client_request_id, i + 1);
    return no;
  });

  // 批量查询已存在的幂等号
  const existingByNoMap = await t.measure('batch_idempotency', () =>
    batchFindExistingByNo(env.DB, 'pc_in', 'in_no', itemNos, 'in_no, asset_id')
  );

  // 收集所有序列号进行批量检查
  const serialMap = new Map<string, { index: number; normalized: string }>();
  const seenSerial = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it?.serial_no) continue;
    const normalized = normalizePcSerialNo(it.serial_no);
    if (seenSerial.has(normalized)) continue;
    seenSerial.add(normalized);
    serialMap.set(normalized, { index: i, normalized });
  }

  // 批量查询已存在的序列号
  const existingSerialMap = await t.measure('batch_serial', () =>
    batchFindAssetsBySerial(env.DB, [...serialMap.keys()], 'pc_assets')
  );

  // 预加载品牌字典（只调用一次）
  const allBrands = [...new Set(items.map(it => it?.brand).filter(Boolean))];
  for (const brand of allBrands) {
    await assertPcBrandDictionaryValue(env.DB, brand, '电脑品牌');
  }

  let success = 0;
  let duplicated = 0;
  const errors: { row: number; message: string }[] = [];

  // 收集需要执行的语句
  const auditRecords: Array<{ no: string; data: any }> = [];
  const processedSerials = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    try {
      const it: any = items[i] || {};
      const no = itemNos[i];

      // 检查幂等
      if (existingByNoMap.has(no)) {
        success++;
        duplicated++;
        continue;
      }

      const brand = must(it?.brand, '品牌', 120);
      const serial_no = normalizePcSerialNo(must(it?.serial_no, '序列号', 120));
      const model = must(it?.model, '型号', 160);

      // 检查序列号重复
      if (processedSerials.has(serial_no)) {
        throw new Error('本次导入中存在重复序列号');
      }
      processedSerials.add(serial_no);
      const existingAsset = existingSerialMap.get(serial_no);
      const manufacture_date = assertDateText(must(it?.manufacture_date, '出厂时间', 40), '出厂时间');
      const warranty_end = assertDateText(optional(it?.warranty_end, 40), '保修到期');
      const disk_capacity = optional(it?.disk_capacity, 40);
      const memory_size = optional(it?.memory_size, 40);
      const remark = trimRemarkByRule(optional(it?.remark, 2000), quality.remarkMaxLength);
      const manufactureTs = pcDateTextToUnixTs(manufacture_date);
      const warrantyEndTs = pcDateTextToUnixTs(warranty_end);
      const searchText = buildPcAssetSearchText({
        brand, serial_no, model, remark, disk_capacity, memory_size,
      });

      if (existingAsset?.id) {
        // 更新已存在的资产
        const assetId = Number(existingAsset.id);
        const statements = [
          env.DB.prepare(
            `UPDATE pc_assets
             SET brand=?, serial_no=?, model=?, manufacture_date=?, warranty_end=?, manufacture_ts=?, warranty_end_ts=?,
                 disk_capacity=?, memory_size=?, remark=?, search_text_norm=?, status='IN_STOCK', updated_at=${sqlNowStored()}
             WHERE id=?`
          ).bind(brand, serial_no, model, manufacture_date, warranty_end, manufactureTs, warrantyEndTs, disk_capacity, memory_size, remark, searchText, assetId),

        // 插入入库记录
          env.DB.prepare(
            `INSERT INTO pc_in (in_no, asset_id, brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, created_by, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?, ${sqlNowStored()})`
          ).bind(no, assetId, brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, user.username),

        // 更新最新状态
          env.DB.prepare(`DELETE FROM pc_asset_latest_state WHERE asset_id=?`).bind(assetId),
          env.DB.prepare(
            `INSERT INTO pc_asset_latest_state (asset_id, last_in_id, updated_at)
             VALUES (?, (SELECT id FROM pc_in WHERE in_no=? LIMIT 1), ${sqlNowStored()})`
          ).bind(assetId, no),
        ];
        await t.measure('batch_execute_row', () => env.DB.batch(statements));

        auditRecords.push({ no, data: { asset_id: assetId, brand, serial_no, model, manufacture_date } });
      } else {
        // 创建新资产
        const statements = [
          env.DB.prepare(
            `INSERT INTO pc_assets (brand, serial_no, model, manufacture_date, warranty_end, manufacture_ts, warranty_end_ts, disk_capacity, memory_size, remark, search_text_norm, status, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?, 'IN_STOCK', ${sqlNowStored()}, ${sqlNowStored()})`
          ).bind(brand, serial_no, model, manufacture_date, warranty_end, manufactureTs, warrantyEndTs, disk_capacity, memory_size, remark, searchText),

        // 插入入库记录
          env.DB.prepare(
            `INSERT INTO pc_in (in_no, asset_id, brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, created_by, created_at)
             VALUES (
               ?,
               (SELECT id FROM pc_assets WHERE UPPER(TRIM(serial_no))=? LIMIT 1),
               ?,?,?,?,?,?,?,?,?,
               ${sqlNowStored()}
             )`
          ).bind(no, serial_no, brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, user.username),

        // 更新最新状态
          env.DB.prepare(
            `INSERT INTO pc_asset_latest_state (asset_id, last_in_id, updated_at)
             VALUES (
               (SELECT asset_id FROM pc_in WHERE in_no=? LIMIT 1),
               (SELECT id FROM pc_in WHERE in_no=? LIMIT 1),
               ${sqlNowStored()}
             )`
          ).bind(no, no),
        ];
        await t.measure('batch_execute_row', () => env.DB.batch(statements));

        auditRecords.push({ no, data: { brand, serial_no, model, manufacture_date } });
      }

      success++;
    } catch (e: any) {
      errors.push({ row: i + 2, message: e?.message || '导入失败' });
    }
  }

  if (success > duplicated) {
    // 同步字典计数
    await syncSystemDictionaryUsageCounters(env.DB, ['pc_brand']).catch(() => {});

    // 异步写入审计日志
    for (const record of auditRecords) {
      waitUntil(logAudit(env.DB, request, user, 'PC_IN_BATCH', 'pc_in', record.no, record.data).catch(() => {}));
    }
  }

  if (success > duplicated) invalidateAssetListCache('pc-assets');
  return Response.json({ ok: true, success, duplicated, failed: errors.length, errors });
});
