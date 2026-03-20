import { buildKeywordWhere } from '../_search';
import { must, optional } from '../_pc';
import { sqlNowStored } from '../_time';

export type QueryParts = { where: string; binds: any[]; page: number; pageSize: number; offset: number; fast: boolean };

export type PcAssetInput = {
  brand: string;
  serial_no: string;
  model: string;
  manufacture_date: string | null;
  warranty_end: string | null;
  disk_capacity: string | null;
  memory_size: string | null;
  remark: string | null;
};

export type MonitorAssetInput = {
  asset_code: string;
  sn: string | null;
  brand: string | null;
  model: string | null;
  size_inch: string | null;
  remark: string | null;
  location_id: number | null;
};

export function getPageParams(url: URL, defaultPageSize = 50, maxPageSize = 200) {
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(maxPageSize, Math.max(20, Number(url.searchParams.get('page_size') || defaultPageSize)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function buildWhere(clauses: string[], binds: any[]) {
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', binds };
}

function escapeSqlLike(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function applyArchiveReasonFilter(clauses: string[], binds: any[], url: URL) {
  const archiveReason = (url.searchParams.get('archive_reason') || '').trim();
  if (!archiveReason) return;
  const mode = (url.searchParams.get('archive_reason_mode') || '').trim().toLowerCase();
  if (mode === 'contains' || mode === 'like') {
    clauses.push("TRIM(COALESCE(a.archived_reason, '')) LIKE ? ESCAPE '\\'");
    binds.push(`%${escapeSqlLike(archiveReason)}%`);
    return;
  }
  clauses.push("TRIM(COALESCE(a.archived_reason, ''))=?");
  binds.push(archiveReason);
}

export function buildPcAssetQuery(url: URL) {
  const status = (url.searchParams.get('status') || '').trim();
  const keyword = (url.searchParams.get('keyword') || '').trim();
  const ageYears = Math.max(0, Number(url.searchParams.get('age_years') || 0));
  const { page, pageSize, offset } = getPageParams(url);
  const showArchived = (url.searchParams.get('show_archived') || '').trim() === '1';
  const archiveMode = (url.searchParams.get('archive_mode') || '').trim();
  const clauses: string[] = [];
  if (archiveMode === 'archived') clauses.push('COALESCE(a.archived, 0)=1');
  else if (archiveMode === 'all' || showArchived) { /* include both */ }
  else clauses.push('COALESCE(a.archived, 0)=0');
  const binds: any[] = [];

  if (status) {
    clauses.push('a.status=?');
    binds.push(status);
  }

  if (keyword) {
    const kw = buildKeywordWhere(keyword, {
      numericId: 'a.id',
      exact: ['a.serial_no'],
      prefix: ['a.serial_no', 'a.brand', 'a.model'],
      contains: ['a.brand', 'a.model', 'a.remark'],
    });
    if (kw.sql) {
      clauses.push(kw.sql);
      binds.push(...kw.binds);
    }
  }

  applyArchiveReasonFilter(clauses, binds, url);

  if (ageYears > 0) {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - ageYears);
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
    clauses.push("a.manufacture_date IS NOT NULL AND a.manufacture_date<>'' AND a.manufacture_date<=?");
    binds.push(cutoffStr);
    if (!status) clauses.push("a.status IN ('IN_STOCK','ASSIGNED','RECYCLED')");
  }

  return {
    ...buildWhere(clauses, binds),
    page,
    pageSize,
    offset,
    fast: (url.searchParams.get('fast') || '').trim() === '1',
  } satisfies QueryParts;
}

export function buildMonitorAssetQuery(url: URL) {
  const status = (url.searchParams.get('status') || '').trim();
  const locationId = Number(url.searchParams.get('location_id') || 0) || 0;
  const keyword = (url.searchParams.get('keyword') || '').trim();
  const { page, pageSize, offset } = getPageParams(url);
  const showArchived = (url.searchParams.get('show_archived') || '').trim() === '1';
  const archiveMode = (url.searchParams.get('archive_mode') || '').trim();
  const clauses: string[] = [];
  if (archiveMode === 'archived') clauses.push('COALESCE(a.archived, 0)=1');
  else if (archiveMode === 'all' || showArchived) { /* include both */ }
  else clauses.push('COALESCE(a.archived, 0)=0');
  const binds: any[] = [];

  if (status) {
    clauses.push('a.status=?');
    binds.push(status);
  }
  if (locationId) {
    clauses.push('a.location_id=?');
    binds.push(locationId);
  }
  if (keyword) {
    const kw = buildKeywordWhere(keyword, {
      numericId: 'a.id',
      exact: ['a.asset_code', 'a.sn', 'a.employee_no'],
      prefix: ['a.asset_code', 'a.sn', 'a.brand', 'a.model', 'a.employee_name', 'a.department'],
      contains: ['a.brand', 'a.model', 'a.remark', 'a.employee_name', 'a.department'],
    });
    if (kw.sql) {
      clauses.push(kw.sql);
      binds.push(...kw.binds);
    }
  }

  applyArchiveReasonFilter(clauses, binds, url);

  return {
    ...buildWhere(clauses, binds),
    page,
    pageSize,
    offset,
    fast: (url.searchParams.get('fast') || '').trim() === '1',
  } satisfies QueryParts;
}

export async function countByWhere(db: D1Database, tableWithAlias: string, query: Pick<QueryParts, 'where' | 'binds'>) {
  const row = await db.prepare(`SELECT COUNT(*) as c FROM ${tableWithAlias} ${query.where}`).bind(...query.binds).first<any>();
  return Number(row?.c || 0);
}

export async function listPcAssets(db: D1Database, query: QueryParts) {
  const sql = `
    WITH page_a AS (
      SELECT a.id
      FROM pc_assets a
      ${query.where}
      ORDER BY a.id ASC
      LIMIT ? OFFSET ?
    ),
    latest_out AS (
      SELECT asset_id, MAX(id) AS max_id
      FROM pc_out
      WHERE asset_id IN (SELECT id FROM page_a)
      GROUP BY asset_id
    ),
    latest_in AS (
      SELECT asset_id, MAX(id) AS max_id
      FROM pc_in
      WHERE asset_id IN (SELECT id FROM page_a)
      GROUP BY asset_id
    ),
    latest_recycle AS (
      SELECT asset_id, MAX(id) AS max_id
      FROM pc_recycle
      WHERE asset_id IN (SELECT id FROM page_a)
      GROUP BY asset_id
    )
    SELECT
      a.*,
      o.employee_no   AS last_employee_no,
      o.employee_name AS last_employee_name,
      o.department    AS last_department,
      o.config_date   AS last_config_date,
      r.recycle_date  AS last_recycle_date,
      o.created_at    AS last_out_at,
      i.created_at    AS last_in_at
    FROM pc_assets a
    JOIN page_a p ON p.id = a.id
    LEFT JOIN latest_out lo ON lo.asset_id = a.id
    LEFT JOIN pc_out o ON o.id = lo.max_id
    LEFT JOIN latest_recycle lr ON lr.asset_id = a.id
    LEFT JOIN pc_recycle r ON r.id = lr.max_id
    LEFT JOIN latest_in li ON li.asset_id = a.id
    LEFT JOIN pc_in i ON i.id = li.max_id
    ORDER BY a.id ASC
  `;
  const result = await db.prepare(sql).bind(...query.binds, query.pageSize, query.offset).all();
  return result.results || [];
}

export async function listMonitorAssets(db: D1Database, query: QueryParts) {
  const sql = `
    SELECT
      a.*,
      l.name AS location_name,
      p.name AS parent_location_name
    FROM monitor_assets a
    LEFT JOIN pc_locations l ON l.id = a.location_id
    LEFT JOIN pc_locations p ON p.id = l.parent_id
    ${query.where}
    ORDER BY a.id ASC
    LIMIT ? OFFSET ?
  `;
  const result = await db.prepare(sql).bind(...query.binds, query.pageSize, query.offset).all();
  return result.results || [];
}

export function parsePcAssetInput(body: any): PcAssetInput {
  return {
    brand: must(body?.brand, '品牌', 120),
    serial_no: must(body?.serial_no, '序列号', 120),
    model: must(body?.model, '型号', 200),
    manufacture_date: optional(body?.manufacture_date, 20),
    warranty_end: optional(body?.warranty_end, 20),
    disk_capacity: optional(body?.disk_capacity, 60),
    memory_size: optional(body?.memory_size, 60),
    remark: optional(body?.remark, 1000),
  };
}

export function parseMonitorAssetInput(body: any): MonitorAssetInput {
  return {
    asset_code: must(body?.asset_code, '资产编号', 120),
    sn: optional(body?.sn, 120),
    brand: optional(body?.brand, 120),
    model: optional(body?.model, 200),
    size_inch: optional(body?.size_inch, 60),
    remark: optional(body?.remark, 1000),
    location_id: Number(body?.location_id || 0) || null,
  };
}

export function parseArchiveMeta(body: any) {
  return {
    reason: optional(body?.reason, '归档原因', 120) || '手动归档',
    note: optional(body?.note, 500),
  };
}

export function parseOwnerInput(body: any) {
  return {
    employee_no: optional(body?.employee_no, 60),
    employee_name: must(body?.employee_name, '领用人', 120),
    department: optional(body?.department, 120),
  };
}

export async function assertUnique(db: D1Database, sql: string, binds: any[], message: string) {
  const row = await db.prepare(sql).bind(...binds).first<any>();
  if (row) throw Object.assign(new Error(message), { status: 400 });
}

export function pcAssetArchiveSql() {
  return `
    UPDATE pc_assets
    SET archived=1,
        archived_at=${sqlNowStored()},
        archived_reason=?,
        archived_note=?,
        archived_by=?,
        updated_at=${sqlNowStored()}
    WHERE id=?
  `;
}

export function monitorAssetArchiveSql() {
  return `
    UPDATE monitor_assets
    SET archived=1,
        archived_at=${sqlNowStored()},
        archived_reason=?,
        archived_note=?,
        archived_by=?,
        updated_at=${sqlNowStored()}
    WHERE id=?
  `;
}

export function pcAssetRestoreSql() {
  return `
    UPDATE pc_assets
    SET archived=0,
        archived_at=NULL,
        archived_reason=NULL,
        archived_note=NULL,
        archived_by=NULL,
        updated_at=${sqlNowStored()}
    WHERE id=?
  `;
}

export function monitorAssetRestoreSql() {
  return `
    UPDATE monitor_assets
    SET archived=0,
        archived_at=NULL,
        archived_reason=NULL,
        archived_note=NULL,
        archived_by=NULL,
        updated_at=${sqlNowStored()}
    WHERE id=?
  `;
}

export function pcAssetBulkStatusSql() {
  return `UPDATE pc_assets SET status=?, updated_at=${sqlNowStored()} WHERE id=?`;
}

export function monitorAssetBulkStatusSql() {
  return `
    UPDATE monitor_assets
    SET status=?, employee_no=CASE WHEN ?='ASSIGNED' THEN employee_no ELSE NULL END,
        department=CASE WHEN ?='ASSIGNED' THEN department ELSE NULL END,
        employee_name=CASE WHEN ?='ASSIGNED' THEN employee_name ELSE NULL END,
        is_employed=CASE WHEN ?='ASSIGNED' THEN is_employed ELSE NULL END,
        updated_at=${sqlNowStored()}
    WHERE id=?
  `;
}

export function monitorAssetBulkLocationSql() {
  return `UPDATE monitor_assets SET location_id=?, updated_at=${sqlNowStored()} WHERE id=?`;
}

export function monitorAssetBulkOwnerSql() {
  return `
    UPDATE monitor_assets
    SET status='ASSIGNED', employee_no=?, department=?, employee_name=?, is_employed='Y', updated_at=${sqlNowStored()}
    WHERE id=?
  `;
}

export function latestPcOutRowSql() {
  return `SELECT id FROM pc_out WHERE asset_id=? ORDER BY id DESC LIMIT 1`;
}

export function pcAssetBulkOwnerSql() {
  return `UPDATE pc_out SET employee_no=?, department=?, employee_name=? WHERE id=?`;
}

export function pcAssetUpdateSql() {
  return `
    UPDATE pc_assets
    SET brand=?, serial_no=?, model=?, manufacture_date=?, warranty_end=?, disk_capacity=?, memory_size=?, remark=?, archived=0, updated_at=${sqlNowStored()}
    WHERE id=?
  `;
}

export function monitorAssetInsertSql() {
  return `
    INSERT INTO monitor_assets (asset_code, sn, brand, model, size_inch, remark, status, location_id, archived, created_at, updated_at)
    VALUES (?,?,?,?,?,?, 'IN_STOCK', ?, 0, ${sqlNowStored()}, ${sqlNowStored()})
  `;
}

export function monitorAssetUpdateSql() {
  return `
    UPDATE monitor_assets
    SET asset_code=?, sn=?, brand=?, model=?, size_inch=?, remark=?, location_id=?, archived=0, updated_at=${sqlNowStored()}
    WHERE id=?
  `;
}
