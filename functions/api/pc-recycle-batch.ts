import { requireAuth, errorResponse } from '../_auth';
import { logAudit } from './_audit';
import { ensurePcSchema, must, optional, normalizeText, pcRecycleNo } from './_pc';
import { applyPcRecycle, normalizePcSerialNo, pcRecycleAuditAction } from './services/asset-write';
import { buildChildWriteNo } from './services/write-idempotency';

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

function placeholders(count: number) {
  return Array.from({ length: count }, () => '?').join(',');
}

async function loadExistingRecycleNos(db: D1Database, nos: string[]) {
  if (!nos.length) return new Set<string>();
  const rows = await db.prepare(`SELECT recycle_no FROM pc_recycle WHERE recycle_no IN (${placeholders(nos.length)})`).bind(...nos).all<any>();
  return new Set((rows.results || []).map((row: any) => String(row?.recycle_no || '')));
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

async function loadLatestOwners(db: D1Database, assetIds: number[]) {
  if (!assetIds.length) return new Map<number, any>();
  const rows = await db.prepare(`SELECT asset_id, current_employee_no, current_department, current_employee_name FROM pc_asset_latest_state WHERE asset_id IN (${placeholders(assetIds.length)})`).bind(...assetIds).all<any>();
  return new Map((rows.results || []).map((row: any) => [Number(row.asset_id), {
    employee_no: row.current_employee_no ?? null,
    department: row.current_department ?? null,
    employee_name: row.current_employee_name ?? null,
    is_employed: null,
  }]));
}

function resolveBatchAsset(maps: { byId: Map<number, any>; bySerial: Map<string, any> }, item: Item) {
  const assetId = Number(item?.asset_id || 0);
  if (assetId > 0 && maps.byId.has(assetId)) return maps.byId.get(assetId);
  const serial = normalizePcSerialNo(item?.serial_no);
  if (serial && maps.bySerial.has(serial)) return maps.bySerial.get(serial);
  return null;
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuth(env, request, 'operator');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });
    await ensurePcSchema(env.DB);

    const body = await request.json<any>().catch(() => ({} as any));
    const items: Item[] = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return Response.json({ ok: false, message: 'items 不能为空' }, { status: 400 });

    const recycleNos = items.map((_, index) => buildChildWriteNo('PCR', pcRecycleNo, body?.client_request_id, index + 1).no);
    const assetMaps = await loadPcAssetsForBatch(env.DB, items);
    const ownerMap = await loadLatestOwners(env.DB, [...assetMaps.byId.keys()]);
    const existingNos = await loadExistingRecycleNos(env.DB, recycleNos);

    let success = 0;
    let duplicated = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const it: any = items[i] || {};
        const no = recycleNos[i];
        if (existingNos.has(no)) {
          success++;
          duplicated++;
          continue;
        }

        const asset = resolveBatchAsset(assetMaps, it);
        if (!asset) throw new Error('未找到该电脑资产（请检查序列号/asset_id）');
        if (!assertAssigned(asset.status)) throw new Error('该电脑当前不是“已领用”，无法回收/归还');

        const action = normalizeAction(it?.action);
        const recycle_date = must(it?.recycle_date, '回收/归还日期', 40);
        const remark = optional(it?.remark, 2000);
        const lastOut = ownerMap.get(Number(asset.id)) || null;

        const afterStatus = await applyPcRecycle({
          db: env.DB,
          recycleNo: no,
          action,
          asset,
          lastOut,
          recycleDate: recycle_date,
          remark,
          createdBy: user.username,
        });

        waitUntil(logAudit(env.DB, request, user, `${pcRecycleAuditAction(action)}_BATCH`, 'pc_recycle', no, {
          asset_id: asset.id,
          serial_no: asset.serial_no,
          action,
          recycle_date,
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
