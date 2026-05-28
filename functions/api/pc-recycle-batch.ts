import { withErrorHandling } from './_error';
import { logAudit } from './_audit';
import { ensurePcSchema, must, optional, normalizeText, pcRecycleNo } from './_pc';
import { pcRecycleAuditAction, pcStatusAfterRecycle } from './services/asset-write';
import { buildChildWriteNo, findExistingByNo } from './services/write-idempotency';
import { assertPcAssetDataScopeAccess, requireAuthWithDataScope } from './services/data-scope';
import { invalidateAssetListCache } from './services/asset-list-cache';
import { sqlNowStored } from './_time';
import { syncSystemDictionaryUsageCounters } from './services/system-dictionaries';
import { batchFindExistingByNo, batchFindAssetsByIds, batchFindAssetsBySerial } from './services/batch-utils';

function assertAssigned(status: any) {
  return String(status) === 'ASSIGNED';
}

function normalizeAction(v: any) {
  const t = normalizeText(v, 20);
  const u = t.toUpperCase();
  if (u === 'RETURN' || t === '归还') return 'RETURN' as const;
  if (u === 'RECYCLE' || t === '回收') return 'RECYCLE' as const;
  const err: any = new Error('动作(action) 必须是 RETURN(归还) 或 RECYCLE(回收)');
  err.status = 400;
  throw err;
}

type Item = {
  asset_id?: number;
  serial_no?: string;
  action: 'RETURN' | 'RECYCLE' | string;
  recycle_date: string;
  remark?: string;
};

export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request, waitUntil }) => {
  const user = await requireAuthWithDataScope(env, request, 'operator');
  if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });
  await ensurePcSchema(env.DB);

  const body = await request.json().catch(() => ({} as any));
  const items: Item[] = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return Response.json({ ok: false, message: 'items 不能为空' }, { status: 400 });

  // 预生成所有幂等号
  const itemNos = items.map((_, i) => {
    const { no } = buildChildWriteNo('PCR', pcRecycleNo, body?.client_request_id, i + 1);
    return no;
  });

  // 批量查询已存在的幂等号
  const existingByNoMap = await batchFindExistingByNo(env.DB, 'pc_recycle', 'recycle_no', itemNos, 'recycle_no, asset_id');

  // 收集所有资产 ID 和序列号进行批量查询
  const assetIdsToFetch: number[] = [];
  const serialsToFetch: string[] = [];
  for (const it of items) {
    if (it.asset_id) assetIdsToFetch.push(Number(it.asset_id));
    else if (it.serial_no) serialsToFetch.push(it.serial_no);
  }

  // 批量查询资产
  const assetsByIdMap = await batchFindAssetsByIds(env.DB, assetIdsToFetch, 'pc_assets');
  const assetsBySerialMap = await batchFindAssetsBySerial(env.DB, serialsToFetch, 'pc_assets');

  // 批量查询最近的出库记录
  const assetIdsForLastOut = new Set<number>();
  for (const it of items) {
    let asset: any = null;
    if (it.asset_id) asset = assetsByIdMap.get(Number(it.asset_id));
    else if (it.serial_no) {
      const normalizedSn = String(it.serial_no).trim().toUpperCase();
      asset = assetsBySerialMap.get(normalizedSn);
    }
    if (asset?.id) assetIdsForLastOut.add(Number(asset.id));
  }

  // 批量查询每个资产的最近出库记录
  const lastOutMap = new Map<number, any>();
  if (assetIdsForLastOut.size > 0) {
    const ids = [...assetIdsForLastOut];
    const placeholders = ids.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT asset_id, employee_no, department, employee_name, is_employed
       FROM pc_out
       WHERE asset_id IN (${placeholders})
       GROUP BY asset_id
       HAVING id = MAX(id)`
    ).bind(...ids).all();
    for (const row of (results || []) as any[]) {
      lastOutMap.set(Number(row?.asset_id || 0), row);
    }
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

      // 获取资产
      let asset: any = null;
      if (it.asset_id) {
        asset = assetsByIdMap.get(Number(it.asset_id));
      } else if (it.serial_no) {
        const normalizedSn = String(it.serial_no).trim().toUpperCase();
        asset = assetsBySerialMap.get(normalizedSn);
      }
      if (!asset) throw new Error('未找到该电脑资产（请检查序列号/asset_id）');

      await assertPcAssetDataScopeAccess(env.DB, user, Number(asset.id || 0), '电脑批量回收/归还');
      if (!assertAssigned(asset.status)) throw new Error('该电脑当前不是"已领用"，无法回收/归还');

      const action = normalizeAction(it?.action);
      const recycle_date = must(it?.recycle_date, '回收/归还日期', 40);
      const remark = optional(it?.remark, 2000);
      const lastOut = lastOutMap.get(Number(asset.id)) || null;
      const statusAfter = pcStatusAfterRecycle(action);

      // 插入回收/归还记录
      statements.push(
        env.DB.prepare(
          `INSERT INTO pc_recycle (
            recycle_no, action, asset_id,
            employee_no, department, employee_name, is_employed,
            brand, serial_no, model,
            recycle_date, remark, created_by, created_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, ${sqlNowStored()})`
        ).bind(
          no, action, asset.id,
          lastOut?.employee_no ?? null, lastOut?.department ?? null,
          lastOut?.employee_name ?? null, lastOut?.is_employed ?? null,
          asset.brand, asset.serial_no, asset.model,
          recycle_date, remark, user.username
        )
      );

      // 更新资产状态
      statements.push(
        env.DB.prepare(`UPDATE pc_assets SET status=?, updated_at=${sqlNowStored()} WHERE id=?`)
          .bind(statusAfter, asset.id)
      );

      // 更新最新状态
      statements.push(
        env.DB.prepare(
          `INSERT INTO pc_asset_latest_state (
            asset_id, last_out_id, last_in_id, last_recycle_id,
            current_employee_no, current_employee_name, current_department,
            last_config_date, last_out_at, last_in_at, last_recycle_date, updated_at
          ) VALUES (
            ?, NULL, NULL, (SELECT id FROM pc_recycle WHERE recycle_no=? LIMIT 1),
            NULL, NULL, NULL, NULL, NULL, NULL, ?, ${sqlNowStored()}
          )
          ON CONFLICT(asset_id) DO UPDATE SET
            last_recycle_id=(SELECT id FROM pc_recycle WHERE recycle_no=? LIMIT 1),
            last_recycle_date=excluded.last_recycle_date,
            current_employee_no=NULL,
            current_employee_name=NULL,
            current_department=NULL,
            updated_at=${sqlNowStored()}`
        ).bind(asset.id, no, recycle_date, no)
      );

      auditRecords.push({
        no,
        data: { asset_id: asset.id, serial_no: asset.serial_no, action, recycle_date, status_after: statusAfter },
      });
      success++;
    } catch (e: any) {
      errors.push({ row: i + 2, message: e?.message || '导入失败' });
    }
  }

  // 批量执行所有语句
  if (statements.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < statements.length; i += batchSize) {
      const batch = statements.slice(i, i + batchSize);
      await env.DB.batch(batch);
    }

    await syncSystemDictionaryUsageCounters(env.DB, []).catch(() => {});

    for (const record of auditRecords) {
      waitUntil(logAudit(env.DB, request, user, `${pcRecycleAuditAction(auditRecords[0]?.data?.action || 'RETURN')}_BATCH`, 'pc_recycle', record.no, record.data).catch(() => {}));
    }
  }

  if (success > duplicated) invalidateAssetListCache('pc-assets');
  return Response.json({ ok: true, success, duplicated, failed: errors.length, errors });
});
