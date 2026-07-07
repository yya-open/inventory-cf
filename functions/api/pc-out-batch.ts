import { withErrorHandling } from './_error';
import { logAudit } from './_audit';
import {
  ensurePcSchemaIfAllowed,
  must,
  optional,
  pcOutNo,
  isInStockStatus,
  toAssetStatusAfterOut,
} from './_pc';
import { createTiming } from './_timing';
import { assertDateText, assertEmployeeNo, getDataQualitySettings, trimRemarkByRule } from './services/data-quality';
import { assertDepartmentDictionaryValue } from './services/master-data';
import { buildChildWriteNo, findExistingByNo } from './services/write-idempotency';
import { assertPcAssetIdsDataScopeAccess, requireAuthWithDataScope } from './services/data-scope';
import { invalidateAssetListCache } from './services/asset-list-cache';
import { sqlNowStored } from './_time';
import { syncSystemDictionaryUsageCounters } from './services/system-dictionaries';
import { batchFindExistingByNo, batchFindAssetsByIds, batchFindAssetsBySerial } from './services/batch-utils';

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

export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string; __timing?: any }>(async ({ env, request, waitUntil }) => {
  const t = env.__timing || createTiming();
  const url = new URL(request.url);
  const user = await t.measure('auth', () => requireAuthWithDataScope(env, request, 'operator'));
  if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });
  await t.measure('schema', () => ensurePcSchemaIfAllowed(env.DB, env, url));

  const body = await t.measure('parse', () => request.json().catch(() => ({} as any)));
  const quality = await t.measure('settings', () => getDataQualitySettings(env.DB));
  const items: Item[] = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return Response.json({ ok: false, message: 'items 不能为空' }, { status: 400 });

  // 预生成所有幂等号
  const itemNos = items.map((_, i) => {
    const { no } = buildChildWriteNo('PCOUT', pcOutNo, body?.client_request_id, i + 1);
    return no;
  });

  // 批量查询已存在的幂等号
  const existingByNoMap = await t.measure('batch_idempotency', () =>
    batchFindExistingByNo(env.DB, 'pc_out', 'out_no', itemNos, 'out_no, asset_id')
  );

  // 收集所有资产 ID 和序列号进行批量查询
  const assetIdsToFetch: number[] = [];
  const serialsToFetch: string[] = [];
  for (const it of items) {
    if (it.asset_id) assetIdsToFetch.push(Number(it.asset_id));
    else if (it.serial_no) serialsToFetch.push(it.serial_no);
  }

  // 批量查询资产
  const assetsByIdMap = await t.measure('batch_assets_by_id', () =>
    batchFindAssetsByIds(env.DB, assetIdsToFetch, 'pc_assets')
  );
  const assetsBySerialMap = await t.measure('batch_assets_by_serial', () =>
    batchFindAssetsBySerial(env.DB, serialsToFetch, 'pc_assets')
  );

  const assetIdsForScope = new Set<number>();
  for (let i = 0; i < items.length; i++) {
    if (existingByNoMap.has(itemNos[i])) continue;
    const it = items[i];
    const asset = it?.asset_id
      ? assetsByIdMap.get(Number(it.asset_id))
      : it?.serial_no
        ? assetsBySerialMap.get(String(it.serial_no).trim().toUpperCase())
        : null;
    const assetId = Number(asset?.id || 0);
    if (assetId > 0) assetIdsForScope.add(assetId);
  }
  await t.measure('batch_asset_scope', () =>
    assertPcAssetIdsDataScopeAccess(env.DB, user, [...assetIdsForScope], '电脑批量出库')
  );

  // 预加载部门字典（只调用一次）
  const allDepartments = [...new Set(items.map(it => it?.department).filter(Boolean))];
  for (const dept of allDepartments) {
    await assertDepartmentDictionaryValue(env.DB, dept, '领用部门');
  }

  let success = 0;
  let duplicated = 0;
  const errors: { row: number; message: string }[] = [];
  const statements: D1PreparedStatement[] = [];
  const auditRecords: Array<{ no: string; data: any }> = [];

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

      const employee_no = assertEmployeeNo(must(it?.employee_no, '员工工号', 60), quality.employeeNoPattern);
      const department = must(it?.department, '部门', 120);
      const employee_name = must(it?.employee_name, '员工姓名', 120);
      const is_employed = optional(it?.is_employed, 40);
      const config_date = assertDateText(optional(it?.config_date, 40), '配置日期');
      const remark = trimRemarkByRule(optional(it?.remark, 2000), quality.remarkMaxLength);

      // 获取资产
      let asset: any = null;
      if (it.asset_id) {
        asset = assetsByIdMap.get(Number(it.asset_id));
      } else if (it.serial_no) {
        const normalizedSn = String(it.serial_no).trim().toUpperCase();
        asset = assetsBySerialMap.get(normalizedSn);
      }
      if (!asset) throw new Error('未找到该电脑资产（请检查序列号/asset_id）');

      if (!isInStockStatus(asset.status)) throw new Error('该电脑当前不是"在库"，无法出库');

      const afterStatus = toAssetStatusAfterOut(null);

      // 插入出库记录
      statements.push(
        env.DB.prepare(
          `INSERT INTO pc_out (
            out_no, asset_id,
            employee_no, department, employee_name, is_employed,
            brand, serial_no, model,
            config_date, manufacture_date, warranty_end, disk_capacity, memory_size,
            remark, created_by, created_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ${sqlNowStored()})`
        ).bind(
          no, asset.id,
          employee_no, department, employee_name, is_employed,
          asset.brand, asset.serial_no, asset.model,
          config_date, asset.manufacture_date ?? null, asset.warranty_end ?? null,
          asset.disk_capacity ?? null, asset.memory_size ?? null,
          remark, user.username
        )
      );

      // 更新资产状态
      statements.push(
        env.DB.prepare(`UPDATE pc_assets SET status=?, updated_at=${sqlNowStored()} WHERE id=?`)
          .bind(afterStatus, asset.id)
      );

      // 更新最新状态
      statements.push(
        env.DB.prepare(
          `INSERT INTO pc_asset_latest_state (
            asset_id, last_out_id, last_in_id, last_recycle_id,
            current_employee_no, current_employee_name, current_department,
            last_config_date, last_out_at, last_in_at, last_recycle_date, updated_at
          ) VALUES (
            ?,
            (SELECT id FROM pc_out WHERE out_no=? LIMIT 1),
            NULL, NULL, ?, ?, ?, ?, ${sqlNowStored()}, NULL, NULL, ${sqlNowStored()}
          )
          ON CONFLICT(asset_id) DO UPDATE SET
            last_out_id=(SELECT id FROM pc_out WHERE out_no=? LIMIT 1),
            current_employee_no=excluded.current_employee_no,
            current_employee_name=excluded.current_employee_name,
            current_department=excluded.current_department,
            last_config_date=excluded.last_config_date,
            last_out_at=${sqlNowStored()},
            last_recycle_id=NULL,
            last_recycle_date=NULL,
            updated_at=${sqlNowStored()}`
        ).bind(asset.id, no, employee_no, employee_name, department, config_date, no)
      );

      auditRecords.push({
        no,
        data: { asset_id: asset.id, serial_no: asset.serial_no, employee_no, department, employee_name, status_after: afterStatus },
      });
      success++;
    } catch (e: any) {
      errors.push({ row: i + 2, message: e?.message || '导入失败' });
    }
  }

  // 批量执行所有语句
  if (statements.length > 0) {
    await t.measure('batch_execute', async () => {
      const batchSize = 100;
      for (let i = 0; i < statements.length; i += batchSize) {
        const batch = statements.slice(i, i + batchSize);
        await env.DB.batch(batch);
      }
    });

    await syncSystemDictionaryUsageCounters(env.DB, []).catch(() => {});

    for (const record of auditRecords) {
      waitUntil(logAudit(env.DB, request, user, 'PC_OUT_BATCH', 'pc_out', record.no, record.data).catch(() => {}));
    }
  }

  if (success > duplicated) invalidateAssetListCache('pc-assets');
  return Response.json({ ok: true, success, duplicated, failed: errors.length, errors });
});
