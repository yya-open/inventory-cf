import { getPcAssetByIdOrSerial, isInStockStatus, normalizeText, pcInNo, pcOutNo, pcRecycleNo, pcScrapNo, toAssetStatusAfterOut } from '../_pc';
import { monitorTxNo } from '../_monitor';
import { must, optional } from '../_pc';
import { sqlNowStored } from '../_time';

export type RequestMeta = { ip: string; ua: string };

export function getRequestMeta(request: Request): RequestMeta {
  return {
    ip: request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '',
    ua: request.headers.get('user-agent') || '',
  };
}

export async function getMonitorAssetByIdOrCode(db: D1Database, assetId?: any, assetCode?: any) {
  const id = Number(assetId || 0);
  const code = normalizeText(assetCode, 120);
  if (id) return db.prepare('SELECT * FROM monitor_assets WHERE id=?').bind(id).first<any>();
  if (code) return db.prepare('SELECT * FROM monitor_assets WHERE asset_code=?').bind(code).first<any>();
  return null;
}

export type PcInPayload = {
  brand: string;
  serial_no: string;
  model: string;
  manufacture_date: string;
  warranty_end?: string | null;
  disk_capacity?: string | null;
  memory_size?: string | null;
  remark?: string | null;
};

export async function createPcInRecord(db: D1Database, payload: PcInPayload, createdBy: string) {
  const exist = await db.prepare('SELECT id FROM pc_assets WHERE serial_no=?').bind(payload.serial_no).first<any>();
  if (exist?.id) {
    throw Object.assign(new Error('该序列号已存在，请勿重复入库（如需入库/归还请使用「电脑回收/归还」功能）'), { status: 400 });
  }

  const no = pcInNo();
  const result = await db.batch([
    db.prepare(
      `INSERT INTO pc_assets (
        brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, status, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?, 'IN_STOCK', ${sqlNowStored()}, ${sqlNowStored()})`
    ).bind(
      payload.brand,
      payload.serial_no,
      payload.model,
      payload.manufacture_date,
      payload.warranty_end ?? null,
      payload.disk_capacity ?? null,
      payload.memory_size ?? null,
      payload.remark ?? null,
    ),
  ]);

  const lastId = Number((result?.[0] as any)?.meta?.last_row_id || 0) || 0;
  const assetRow = lastId
    ? await db.prepare('SELECT id FROM pc_assets WHERE id=?').bind(lastId).first<any>()
    : await db.prepare('SELECT id FROM pc_assets WHERE serial_no=?').bind(payload.serial_no).first<any>();
  const assetId = Number(assetRow?.id || 0);
  if (!assetId) throw Object.assign(new Error('创建资产失败'), { status: 500 });

  await db.prepare(
    `INSERT INTO pc_in (
      in_no, asset_id, brand, serial_no, model,
      manufacture_date, warranty_end, disk_capacity, memory_size,
      remark, created_by, created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?, ${sqlNowStored()})`
  ).bind(
    no,
    assetId,
    payload.brand,
    payload.serial_no,
    payload.model,
    payload.manufacture_date,
    payload.warranty_end ?? null,
    payload.disk_capacity ?? null,
    payload.memory_size ?? null,
    payload.remark ?? null,
    createdBy,
  ).run();

  return { in_no: no, asset_id: assetId, created: true as const };
}

export type PcOutPayload = {
  employee_no: string;
  department: string;
  employee_name: string;
  is_employed?: string | null;
  config_date?: string | null;
  remark?: string | null;
};

export async function createPcOutRecord(db: D1Database, asset: any, payload: PcOutPayload, createdBy: string) {
  if (!asset) throw Object.assign(new Error('未找到该电脑资产（请先入库）'), { status: 404 });
  if (!isInStockStatus(asset.status)) {
    throw Object.assign(new Error('该电脑当前不在库，无法出库'), { status: 400 });
  }

  const no = pcOutNo();
  const afterStatus = toAssetStatusAfterOut(null);

  await db.batch([
    db.prepare(
      `INSERT INTO pc_out (
        out_no, asset_id,
        employee_no, department, employee_name, is_employed,
        brand, serial_no, model,
        config_date, manufacture_date, warranty_end, disk_capacity, memory_size,
        remark, created_by, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ${sqlNowStored()})`
    ).bind(
      no,
      asset.id,
      payload.employee_no,
      payload.department,
      payload.employee_name,
      payload.is_employed ?? null,
      asset.brand,
      asset.serial_no,
      asset.model,
      payload.config_date ?? null,
      asset.manufacture_date ?? null,
      asset.warranty_end ?? null,
      asset.disk_capacity ?? null,
      asset.memory_size ?? null,
      payload.remark ?? null,
      createdBy,
    ),
    db.prepare(`UPDATE pc_assets SET status=?, updated_at=${sqlNowStored()} WHERE id=?`).bind(afterStatus, asset.id),
  ]);

  return { out_no: no, asset_id: asset.id, status_after: afterStatus };
}

export function normalizePcRecycleAction(v: any) {
  const t = normalizeText(v, 20);
  const u = t.toUpperCase();
  if (u === 'RETURN' || t === '归还') return 'RETURN' as const;
  if (u === 'RECYCLE' || t === '回收') return 'RECYCLE' as const;
  const err: any = new Error('动作(action) 必须是 RETURN(归还) 或 RECYCLE(回收)');
  err.status = 400;
  throw err;
}

export async function createPcRecycleRecord(
  db: D1Database,
  asset: any,
  action: 'RETURN' | 'RECYCLE',
  recycleDate: string,
  remark: string | null | undefined,
  createdBy: string,
) {
  if (!asset) throw Object.assign(new Error('未找到该电脑资产'), { status: 404 });
  if (String(asset.status) !== 'ASSIGNED') {
    throw Object.assign(new Error('该电脑当前不是“已领用”，无法回收/归还'), { status: 400 });
  }

  const lastOut = await db.prepare(
    `SELECT employee_no, department, employee_name, is_employed
     FROM pc_out
     WHERE asset_id=?
     ORDER BY id DESC
     LIMIT 1`
  ).bind(asset.id).first<any>();

  const afterStatus = action === 'RETURN' ? 'IN_STOCK' : 'RECYCLED';
  const no = pcRecycleNo();

  await db.batch([
    db.prepare(
      `INSERT INTO pc_recycle (
        recycle_no, action, asset_id,
        employee_no, department, employee_name, is_employed,
        brand, serial_no, model,
        recycle_date, remark, created_by, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, ${sqlNowStored()})`
    ).bind(
      no,
      action,
      asset.id,
      lastOut?.employee_no ?? null,
      lastOut?.department ?? null,
      lastOut?.employee_name ?? null,
      lastOut?.is_employed ?? null,
      asset.brand,
      asset.serial_no,
      asset.model,
      recycleDate,
      remark ?? null,
      createdBy,
    ),
    db.prepare(`UPDATE pc_assets SET status=?, updated_at=${sqlNowStored()} WHERE id=?`).bind(afterStatus, asset.id),
  ]);

  return {
    recycle_no: no,
    asset_id: asset.id,
    status_after: afterStatus,
    employee_no: lastOut?.employee_no ?? null,
    employee_name: lastOut?.employee_name ?? null,
    department: lastOut?.department ?? null,
  };
}

export function validatePcScrapAssets(rows: any[]) {
  const notAllowed = rows.filter((r) => r.status === 'ASSIGNED').map((r) => `${r.serial_no || r.id}`);
  if (notAllowed.length) {
    throw Object.assign(new Error(`以下资产处于「已领用」状态，不能直接报废：${notAllowed.join('、')}（请先回收/归还）`), { status: 400 });
  }
  const already = rows.filter((r) => r.status === 'SCRAPPED').map((r) => `${r.serial_no || r.id}`);
  if (already.length) {
    throw Object.assign(new Error(`以下资产已报废，无需重复报废：${already.join('、')}`), { status: 400 });
  }
}

export async function createPcScrapRecord(
  db: D1Database,
  rows: any[],
  scrapDate: string,
  reason: string | null | undefined,
  createdBy: string,
) {
  validatePcScrapAssets(rows);
  const scrapNo = pcScrapNo();
  const stmts: D1PreparedStatement[] = [];
  for (const a of rows) {
    stmts.push(
      db.prepare(`UPDATE pc_assets SET status='SCRAPPED', updated_at=${sqlNowStored()} WHERE id=?`).bind(a.id),
      db.prepare(
        `INSERT INTO pc_scrap (
          scrap_no, asset_id,
          brand, serial_no, model,
          manufacture_date, warranty_end, disk_capacity, memory_size, remark,
          scrap_date, reason, created_by, created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, ${sqlNowStored()})`
      ).bind(
        scrapNo,
        a.id,
        a.brand,
        a.serial_no,
        a.model,
        a.manufacture_date || '',
        a.warranty_end || '',
        a.disk_capacity || '',
        a.memory_size || '',
        a.remark || '',
        scrapDate,
        reason ?? null,
        createdBy,
      )
    );
  }
  await db.batch(stmts);
  return { scrap_no: scrapNo, count: rows.length };
}

export type MonitorTxType = 'IN' | 'OUT' | 'RETURN' | 'TRANSFER' | 'SCRAP';

export type MonitorMovementPayload = {
  txType: MonitorTxType;
  prefix: string;
  asset: any;
  to_location_id?: number | null;
  employee_no?: string | null;
  department?: string | null;
  employee_name?: string | null;
  is_employed?: string | null;
  remark?: string | null;
  createdBy: string;
  requestMeta: RequestMeta;
};

export async function applyMonitorMovement(db: D1Database, payload: MonitorMovementPayload) {
  const { txType, prefix, asset, createdBy, requestMeta } = payload;
  if (!asset) throw Object.assign(new Error('显示器台账不存在'), { status: 404 });
  if (String(asset.status) === 'SCRAPPED') {
    const map = { IN: '入库', OUT: '出库', RETURN: '归还', TRANSFER: '调拨', SCRAP: '报废' } as const;
    throw Object.assign(new Error(`该资产已报废，无法${map[txType]}`), { status: 400 });
  }
  if (txType === 'OUT' && String(asset.status) === 'ASSIGNED') {
    throw Object.assign(new Error('该显示器当前为已领用状态，请先办理归还/回收'), { status: 400 });
  }
  if (txType === 'RETURN' && String(asset.status) !== 'ASSIGNED') {
    throw Object.assign(new Error('该资产当前不是已领用状态，无需归还'), { status: 400 });
  }

  const tx_no = monitorTxNo(prefix);
  const nextStatus = txType === 'OUT' ? 'ASSIGNED' : txType === 'SCRAP' ? 'SCRAPPED' : 'IN_STOCK';
  const toLocation = payload.to_location_id ?? null;
  const nextEmployeeNo = txType === 'OUT' ? payload.employee_no ?? null : null;
  const nextDepartment = txType === 'OUT' ? payload.department ?? null : null;
  const nextEmployeeName = txType === 'OUT' ? payload.employee_name ?? null : null;
  const nextIsEmployed = txType === 'OUT' ? payload.is_employed ?? null : null;

  await db.batch([
    db.prepare(
      `INSERT INTO monitor_tx
        (tx_no, tx_type, asset_id, asset_code, sn, brand, model, size_inch, from_location_id, to_location_id,
         employee_no, department, employee_name, is_employed, remark, created_by, ip, ua)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      tx_no,
      txType,
      asset.id,
      asset.asset_code,
      asset.sn,
      asset.brand,
      asset.model,
      asset.size_inch,
      asset.location_id,
      toLocation,
      txType === 'OUT' ? payload.employee_no ?? null : asset.employee_no ?? null,
      txType === 'OUT' ? payload.department ?? null : asset.department ?? null,
      txType === 'OUT' ? payload.employee_name ?? null : asset.employee_name ?? null,
      txType === 'OUT' ? payload.is_employed ?? null : asset.is_employed ?? null,
      payload.remark ?? null,
      createdBy,
      requestMeta.ip,
      requestMeta.ua,
    ),
    db.prepare(
      `UPDATE monitor_assets
       SET status=?, location_id=?, employee_no=?, department=?, employee_name=?, is_employed=?, updated_at=${sqlNowStored()}
       WHERE id=?`
    ).bind(
      nextStatus,
      txType === 'SCRAP' ? asset.location_id ?? null : toLocation,
      nextEmployeeNo,
      nextDepartment,
      nextEmployeeName,
      nextIsEmployed,
      asset.id,
    ),
  ]);

  return { tx_no, asset_id: asset.id, status_after: nextStatus };
}

export function parseMonitorTarget(body: any) {
  const asset_id = Number(body?.asset_id || 0);
  const asset_code = normalizeText(body?.asset_code, 120);
  if (!asset_id && !asset_code) throw Object.assign(new Error('缺少资产ID/资产编号'), { status: 400 });
  return { asset_id, asset_code };
}

export function parseMonitorOutFields(body: any) {
  return {
    employee_no: must(body?.employee_no, '工号', 80),
    employee_name: must(body?.employee_name, '姓名', 120),
    department: must(body?.department, '部门', 120),
    is_employed: optional(body?.is_employed, 20),
    to_location_id: Number(body?.location_id || body?.to_location_id || 0) || null,
    remark: optional(body?.remark, 1000),
  };
}

export function parseMonitorSimpleLocation(body: any) {
  return {
    to_location_id: Number(body?.location_id || body?.to_location_id || 0) || null,
    remark: optional(body?.remark, 1000),
  };
}

export function parseMonitorTransferFields(body: any) {
  const to_location_id = Number(body?.to_location_id || body?.location_id || 0);
  if (!to_location_id) throw Object.assign(new Error('请选择目标位置'), { status: 400 });
  return { to_location_id, remark: optional(body?.remark, 1000) };
}

export function parseMonitorScrapFields(body: any) {
  return { reason: must(body?.reason || body?.remark, '报废原因', 1000) };
}
