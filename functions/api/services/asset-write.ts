import { sqlNowStored } from '../_time';

export type MonitorMovementType = 'IN' | 'OUT' | 'RETURN' | 'TRANSFER' | 'SCRAP';
export type PcRecycleAction = 'RETURN' | 'RECYCLE';

export function getRequestClientMeta(request: Request) {
  return {
    ip: request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '',
    ua: request.headers.get('user-agent') || '',
  };
}

export function monitorMovementAuditAction(type: MonitorMovementType) {
  return `MONITOR_${type}`;
}

export function pcRecycleAuditAction(action: PcRecycleAction) {
  return action === 'RETURN' ? 'PC_RETURN' : 'PC_RECYCLE';
}

export function pcStatusAfterRecycle(action: PcRecycleAction) {
  return action === 'RETURN' ? 'IN_STOCK' : 'RECYCLED';
}

export async function getMonitorAssetByIdOrCode(db: D1Database, assetId?: number | null, assetCode?: string | null) {
  if (assetId) {
    return db.prepare('SELECT * FROM monitor_assets WHERE id=?').bind(assetId).first<any>();
  }
  if (assetCode) {
    return db.prepare('SELECT * FROM monitor_assets WHERE asset_code=?').bind(assetCode).first<any>();
  }
  return null;
}

export function assertMonitorMovementAllowed(asset: any, type: MonitorMovementType) {
  const status = String(asset?.status || '');
  if (!asset) throw Object.assign(new Error('显示器台账不存在'), { status: 404 });
  if (Number(asset?.archived || 0) === 1) throw Object.assign(new Error('该显示器已归档，请先恢复归档后再执行操作'), { status: 400 });
  if (type === 'IN') {
    if (status === 'SCRAPPED') throw Object.assign(new Error('该资产已报废，无法入库'), { status: 400 });
    return;
  }
  if (type === 'OUT') {
    if (status === 'SCRAPPED') throw Object.assign(new Error('该资产已报废，无法出库'), { status: 400 });
    if (status === 'ASSIGNED') throw Object.assign(new Error('该显示器当前为已领用状态，请先办理归还/回收'), { status: 400 });
    return;
  }
  if (type === 'RETURN') {
    if (status === 'SCRAPPED') throw Object.assign(new Error('该资产已报废，无法归还'), { status: 400 });
    if (status !== 'ASSIGNED') throw Object.assign(new Error('该资产当前不是已领用状态，无需归还'), { status: 400 });
    return;
  }
  if (type === 'TRANSFER') {
    if (status === 'SCRAPPED') throw Object.assign(new Error('该资产已报废，无法调拨'), { status: 400 });
    return;
  }
  if (type === 'SCRAP') {
    if (status === 'SCRAPPED') throw Object.assign(new Error('该资产已报废'), { status: 400 });
  }
}

type ApplyMonitorMovementArgs = {
  db: D1Database;
  asset: any;
  txNo: string;
  type: MonitorMovementType;
  userName: string;
  clientMeta: { ip: string; ua: string };
  toLocationId?: number | null;
  employeeNo?: string | null;
  department?: string | null;
  employeeName?: string | null;
  isEmployed?: string | null;
  remark?: string | null;
};

export async function applyMonitorMovement(args: ApplyMonitorMovementArgs) {
  const {
    db,
    asset,
    txNo,
    type,
    userName,
    clientMeta,
    toLocationId = null,
    employeeNo = null,
    department = null,
    employeeName = null,
    isEmployed = null,
    remark = null,
  } = args;

  const updateSqlByType: Record<MonitorMovementType, { sql: string; binds: any[] }> = {
    IN: {
      sql: `UPDATE monitor_assets
            SET status='IN_STOCK', location_id=?, employee_no=NULL, department=NULL, employee_name=NULL, is_employed=NULL,
                updated_at=${sqlNowStored()}
            WHERE id=?`,
      binds: [toLocationId, asset.id],
    },
    OUT: {
      sql: `UPDATE monitor_assets
            SET status='ASSIGNED', location_id=?, employee_no=?, department=?, employee_name=?, is_employed=?, updated_at=${sqlNowStored()}
            WHERE id=?`,
      binds: [toLocationId, employeeNo, department, employeeName, isEmployed, asset.id],
    },
    RETURN: {
      sql: `UPDATE monitor_assets
            SET status='IN_STOCK', location_id=?, employee_no=NULL, department=NULL, employee_name=NULL, is_employed=NULL,
                updated_at=${sqlNowStored()}
            WHERE id=?`,
      binds: [toLocationId, asset.id],
    },
    TRANSFER: {
      sql: `UPDATE monitor_assets SET location_id=?, updated_at=${sqlNowStored()} WHERE id=?`,
      binds: [toLocationId, asset.id],
    },
    SCRAP: {
      sql: `UPDATE monitor_assets
            SET status='SCRAPPED', employee_no=NULL, department=NULL, employee_name=NULL, is_employed=NULL,
                updated_at=${sqlNowStored()}
            WHERE id=?`,
      binds: [asset.id],
    },
  };

  await db.batch([
    db.prepare(
      `INSERT INTO monitor_tx
        (tx_no, tx_type, asset_id, asset_code, sn, brand, model, size_inch, from_location_id, to_location_id,
         employee_no, department, employee_name, is_employed, remark, created_by, ip, ua)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      txNo,
      type,
      asset.id,
      asset.asset_code,
      asset.sn,
      asset.brand,
      asset.model,
      asset.size_inch,
      asset.location_id,
      toLocationId,
      employeeNo,
      department,
      employeeName,
      isEmployed,
      remark,
      userName,
      clientMeta.ip,
      clientMeta.ua,
    ),
    db.prepare(updateSqlByType[type].sql).bind(...updateSqlByType[type].binds),
  ]);
}

type CreatePcAssetArgs = {
  db: D1Database;
  inNo: string;
  brand: string;
  serialNo: string;
  model: string;
  manufactureDate: string;
  warrantyEnd?: string | null;
  diskCapacity?: string | null;
  memorySize?: string | null;
  remark?: string | null;
  createdBy: string;
};

export async function createPcAssetAndInRecord(args: CreatePcAssetArgs) {
  const { db, inNo, brand, serialNo, model, manufactureDate, warrantyEnd = null, diskCapacity = null, memorySize = null, remark = null, createdBy } = args;
  const ins = await db.batch([
    db.prepare(
      `INSERT INTO pc_assets (brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?, 'IN_STOCK', ${sqlNowStored()}, ${sqlNowStored()})`
    ).bind(brand, serialNo, model, manufactureDate, warrantyEnd, diskCapacity, memorySize, remark),
  ]);
  const lastId = Number((ins?.[0] as any)?.meta?.last_row_id || 0) || 0;
  const assetRow = lastId
    ? await db.prepare('SELECT id FROM pc_assets WHERE id=?').bind(lastId).first<any>()
    : await db.prepare('SELECT id FROM pc_assets WHERE serial_no=?').bind(serialNo).first<any>();
  const assetId = Number(assetRow?.id || 0);
  if (!assetId) throw Object.assign(new Error('创建资产失败'), { status: 500 });
  await db.prepare(
    `INSERT INTO pc_in (in_no, asset_id, brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, ${sqlNowStored()})`
  ).bind(inNo, assetId, brand, serialNo, model, manufactureDate, warrantyEnd, diskCapacity, memorySize, remark, createdBy).run();
  return assetId;
}

type ApplyPcOutArgs = {
  db: D1Database;
  outNo: string;
  asset: any;
  employeeNo: string;
  department: string;
  employeeName: string;
  isEmployed?: string | null;
  configDate?: string | null;
  remark?: string | null;
  createdBy: string;
  statusAfter: string;
};

export async function applyPcOut(args: ApplyPcOutArgs) {
  const { db, outNo, asset, employeeNo, department, employeeName, isEmployed = null, configDate = null, remark = null, createdBy, statusAfter } = args;
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
      outNo,
      asset.id,
      employeeNo,
      department,
      employeeName,
      isEmployed,
      asset.brand,
      asset.serial_no,
      asset.model,
      configDate,
      asset.manufacture_date ?? null,
      asset.warranty_end ?? null,
      asset.disk_capacity ?? null,
      asset.memory_size ?? null,
      remark,
      createdBy,
    ),
    db.prepare(`UPDATE pc_assets SET status=?, updated_at=${sqlNowStored()} WHERE id=?`).bind(statusAfter, asset.id),
  ]);
}

type ApplyPcRecycleArgs = {
  db: D1Database;
  recycleNo: string;
  action: PcRecycleAction;
  asset: any;
  lastOut?: any;
  recycleDate: string;
  remark?: string | null;
  createdBy: string;
};

export async function applyPcRecycle(args: ApplyPcRecycleArgs) {
  const { db, recycleNo, action, asset, lastOut, recycleDate, remark = null, createdBy } = args;
  const statusAfter = pcStatusAfterRecycle(action);
  await db.batch([
    db.prepare(
      `INSERT INTO pc_recycle (
        recycle_no, action, asset_id,
        employee_no, department, employee_name, is_employed,
        brand, serial_no, model,
        recycle_date, remark, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      recycleNo,
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
      remark,
      createdBy,
    ),
    db.prepare(`UPDATE pc_assets SET status=?, updated_at=${sqlNowStored()} WHERE id=?`).bind(statusAfter, asset.id),
  ]);
  return statusAfter;
}

type ApplyPcScrapArgs = {
  db: D1Database;
  scrapNo: string;
  rows: any[];
  scrapDate: string;
  reason?: string | null;
  createdBy: string;
};

export async function applyPcScrap(args: ApplyPcScrapArgs) {
  const { db, scrapNo, rows, scrapDate, reason = null, createdBy } = args;
  const stmts: D1PreparedStatement[] = [];
  for (const row of rows) {
    stmts.push(
      db.prepare(`UPDATE pc_assets SET status='SCRAPPED', updated_at=${sqlNowStored()} WHERE id=?`).bind(row.id),
      db.prepare(
        `INSERT INTO pc_scrap (
          scrap_no, asset_id,
          brand, serial_no, model,
          manufacture_date, warranty_end, disk_capacity, memory_size, remark,
          scrap_date, reason, created_by, created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, ${sqlNowStored()})`
      ).bind(
        scrapNo,
        row.id,
        row.brand,
        row.serial_no,
        row.model,
        row.manufacture_date || '',
        row.warranty_end || '',
        row.disk_capacity || '',
        row.memory_size || '',
        row.remark || '',
        scrapDate,
        reason,
        createdBy,
      )
    );
  }
  await db.batch(stmts);
}
