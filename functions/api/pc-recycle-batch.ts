import { withErrorHandling } from './_error';
import { logAudit } from './_audit';
import { ensurePcSchemaIfAllowed, must, optional, normalizeText, pcRecycleNo } from './_pc';
import { pcRecycleAuditAction, pcStatusAfterRecycle } from './services/asset-write';
import { buildChildWriteNo, findExistingByNo } from './services/write-idempotency';
import { assertPcAssetIdsDataScopeAccess, requireAuthWithDataScope } from './services/data-scope';
import { invalidateAssetListCache } from './services/asset-list-cache';
import { sqlNowStored } from './_time';
import { syncSystemDictionaryUsageCounters } from './services/system-dictionaries';
import { ASSET_BATCH_MAX_ROWS, batchFindExistingByNo, batchFindAssetsByIds, batchFindAssetsBySerial } from './services/batch-utils';
import { runBatchWithGuard, GuardRollbackError, guardRowCountSql } from './_write';
import { chunkValues } from './services/sql-batch';
import { pcEventCreatedAtAfterLatest } from './pc-tx/_recalc';

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
  await ensurePcSchemaIfAllowed(env.DB, env, new URL(request.url));

  const body = await request.json().catch(() => ({} as any));
  const items: Item[] = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return Response.json({ ok: false, message: 'items 不能为空' }, { status: 400 });
  if (items.length > ASSET_BATCH_MAX_ROWS) {
    return Response.json({ ok: false, message: `单次最多导入 ${ASSET_BATCH_MAX_ROWS} 条,请拆分后重试` }, { status: 400 });
  }

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
  const assetIdsForScope = new Set<number>();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    let asset: any = null;
    if (it.asset_id) asset = assetsByIdMap.get(Number(it.asset_id));
    else if (it.serial_no) {
      const normalizedSn = String(it.serial_no).trim().toUpperCase();
      asset = assetsBySerialMap.get(normalizedSn);
    }
    if (asset?.id) {
      const assetId = Number(asset.id);
      assetIdsForLastOut.add(assetId);
      if (!existingByNoMap.has(itemNos[i])) assetIdsForScope.add(assetId);
    }
  }
  await assertPcAssetIdsDataScopeAccess(env.DB, user, [...assetIdsForScope], '电脑批量回收/归还');

  // 批量查询每个资产的最近出库记录
  const lastOutMap = new Map<number, any>();
  if (assetIdsForLastOut.size > 0) {
    const ids = [...assetIdsForLastOut];
    const placeholders = ids.map(() => '?').join(',');
    // 「最新一条 pc_out」的口径必须与 services/pc-latest-state.ts 和 pc-tx/_recalc.ts 一致：
    // created_at DESC, id DESC。旧写法 `GROUP BY asset_id HAVING id = MAX(id)` 依赖 SQLite 的
    // bare-column 特例，且在 created_at 与 id 次序不一致时（补录、导入、恢复）会取到另一行，
    // 导致回收记录快照的领用人与派生表认定的当前领用人不是同一个人。
    const { results } = await env.DB.prepare(
      `SELECT o.asset_id, o.employee_no, o.department, o.employee_name, o.is_employed
       FROM pc_out o
       WHERE o.asset_id IN (${placeholders})
         AND o.id = (
           SELECT id FROM pc_out WHERE asset_id = o.asset_id ORDER BY created_at DESC, id DESC LIMIT 1
         )`
    ).bind(...ids).all();
    for (const row of (results || []) as any[]) {
      lastOutMap.set(Number(row?.asset_id || 0), row);
    }
  }

  let success = 0;
  let duplicated = 0;
  const errors: { row: number; message: string }[] = [];
  const statements: D1PreparedStatement[] = [];
  const writtenNos: string[] = [];
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

      if (!assertAssigned(asset.status)) throw new Error('该电脑当前不是"已领用"，无法回收/归还');

      const action = normalizeAction(it?.action);
      const recycle_date = must(it?.recycle_date, '回收/归还日期', 40);
      const remark = optional(it?.remark, 2000);
      const lastOut = lastOutMap.get(Number(asset.id)) || null;
      const statusAfter = pcStatusAfterRecycle(action);

      // 插入回收/归还记录：以 status='ASSIGNED' 为前置条件，资产被并发回收时插入 0 行，
      // 由本批末尾的守卫检测并整批回滚，避免产生幽灵回收流水。
      statements.push(
        env.DB.prepare(
          `INSERT INTO pc_recycle (
            recycle_no, action, asset_id,
            employee_no, department, employee_name, is_employed,
            brand, serial_no, model,
            recycle_date, remark, created_by, created_at
          )
          SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?, ${pcEventCreatedAtAfterLatest('pc_assets.id')}
            FROM pc_assets WHERE id=? AND status='ASSIGNED'`
        ).bind(
          no, action, asset.id,
          lastOut?.employee_no ?? null, lastOut?.department ?? null,
          lastOut?.employee_name ?? null, lastOut?.is_employed ?? null,
          asset.brand, asset.serial_no, asset.model,
          recycle_date, remark, user.username,
          asset.id
        )
      );

      // 更新资产状态（同样带上前置条件，不覆盖并发结果）
      statements.push(
        env.DB.prepare(`UPDATE pc_assets SET status=?, updated_at=${sqlNowStored()} WHERE id=? AND status='ASSIGNED'`)
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
      writtenNos.push(no);
      success++;
    } catch (e: any) {
      errors.push({ row: i + 2, message: e?.message || '导入失败' });
    }
  }

  // 守卫：断言本次每个回收单号都已落库。任何一条因并发抢占插入 0 行都会触发整批回滚。
  // 单条语句的绑定参数上限为 100，故按 chunkValues 默认粒度切成多条守卫。
  for (const chunk of chunkValues(writtenNos)) {
    statements.push(
      env.DB.prepare(guardRowCountSql('pc_recycle', 'recycle_no', chunk.length)).bind(...chunk, chunk.length)
    );
  }

  // 一个批次 = 一个事务。旧实现按 100 条语句切批，而每项恰好展开 3 条语句，
  // 100 不是 3 的倍数：>=34 项时某一项的 INSERT 会落在前一批、状态更新落在后一批，
  // 中途失败就会留下「台账已回收、资产仍在领用」的撕裂状态，而接口照样返回 ok:true。
  if (statements.length > 0) {
    try {
      await runBatchWithGuard(env.DB, statements);
    } catch (e) {
      if (e instanceof GuardRollbackError) {
        return Response.json(
          { ok: false, message: '批量回收/归还写入异常（可能有电脑已被并发处理），本次已全部回滚（请刷新后重试）' },
          { status: 409 },
        );
      }
      throw e;
    }

    await syncSystemDictionaryUsageCounters(env.DB, []).catch(() => {});

    for (const record of auditRecords) {
      waitUntil(logAudit(env.DB, request, user, `${pcRecycleAuditAction(auditRecords[0]?.data?.action || 'RETURN')}_BATCH`, 'pc_recycle', record.no, record.data).catch(() => {}));
    }
  }

  if (success > duplicated) invalidateAssetListCache('pc-assets');
  return Response.json({ ok: true, success, duplicated, failed: errors.length, errors });
});
