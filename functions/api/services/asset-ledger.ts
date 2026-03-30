import { buildKeywordWhere, buildNormalizedKeywordWhere, normalizeSearchText } from '../_search';
import { buildFtsKeywordWhere, ensureSearchFtsTables } from './search-fts';
import { must, optional } from '../_pc';
import { sqlNowStored } from '../_time';
import { applyDepartmentDataScopeClause, scopeAllowsAssetWarehouse, type UserDataScope } from './data-scope';

export type QueryParts = { where: string; binds: any[]; page: number; pageSize: number; offset: number; fast: boolean; joins?: string };

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


export function pcDateTextToUnixTs(value: string | null | undefined) {
  const text = String(value || '').trim();
  if (!text) return null;
  const ms = Date.parse(`${text}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return Math.trunc(ms / 1000);
}

export function buildPcAssetSearchText(input: Partial<PcAssetInput> | any) {
  return normalizeSearchText(input?.serial_no, input?.brand, input?.model, input?.remark, input?.disk_capacity, input?.memory_size);
}

export function buildMonitorAssetSearchText(input: Partial<MonitorAssetInput> | any, extra?: { employee_no?: string | null; employee_name?: string | null; department?: string | null }) {
  return normalizeSearchText(
    input?.asset_code,
    input?.sn,
    input?.brand,
    input?.model,
    input?.size_inch,
    input?.remark,
    extra?.employee_no,
    extra?.employee_name,
    extra?.department,
  );
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

export function buildPcAssetQuery(url: URL, scope?: UserDataScope | null) {
  const status = (url.searchParams.get('status') || '').trim();
  const keyword = (url.searchParams.get('keyword') || '').trim();
  const ageYears = Math.max(0, Number(url.searchParams.get('age_years') || 0));
  const inventoryStatus = (url.searchParams.get('inventory_status') || '').trim().toUpperCase();
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
  if (inventoryStatus) {
    clauses.push("COALESCE(a.inventory_status, 'UNCHECKED')=?");
    binds.push(inventoryStatus);
  }
  if (!scopeAllowsAssetWarehouse(scope, '电脑仓')) clauses.push('1=0');
  applyDepartmentDataScopeClause(clauses, binds, 's.current_department', scope);

  if (keyword) {
    const kw = buildKeywordWhere(keyword, {
      numericId: 'a.id',
      exact: ['a.serial_no'],
      prefix: ['a.serial_no', 'a.brand', 'a.model'],
      contains: [],
    });
    const fts = buildFtsKeywordWhere(keyword, {
      table: 'pc_assets_fts',
      rowIdColumn: 'a.id',
    });
    const norm = buildNormalizedKeywordWhere(keyword, {
      column: 'a.search_text_norm',
      numericId: 'a.id',
      exact: ['a.serial_no'],
      preferFts: true,
    });
    const parts = [kw.sql, fts.sql, norm.sql].filter(Boolean);
    if (parts.length) {
      clauses.push(parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`);
      binds.push(...kw.binds, ...fts.binds, ...norm.binds);
    }
  }

  applyArchiveReasonFilter(clauses, binds, url);

  if (ageYears > 0) {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - ageYears);
    const cutoffTs = Math.trunc(Date.UTC(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate()) / 1000);
    clauses.push('a.manufacture_ts IS NOT NULL AND a.manufacture_ts<=?');
    binds.push(cutoffTs);
    if (!status) clauses.push("a.status IN ('IN_STOCK','ASSIGNED','RECYCLED')");
  }

  return {
    ...buildWhere(clauses, binds),
    page,
    pageSize,
    offset,
    fast: (url.searchParams.get('fast') || '').trim() === '1',
    joins: 'LEFT JOIN pc_asset_latest_state s ON s.asset_id=a.id',
  } satisfies QueryParts;
}

export function buildMonitorAssetQuery(url: URL, scope?: UserDataScope | null) {
  const status = (url.searchParams.get('status') || '').trim();
  const locationId = Number(url.searchParams.get('location_id') || 0) || 0;
  const keyword = (url.searchParams.get('keyword') || '').trim();
  const inventoryStatus = (url.searchParams.get('inventory_status') || '').trim().toUpperCase();
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
  if (inventoryStatus) {
    clauses.push("COALESCE(a.inventory_status, 'UNCHECKED')=?");
    binds.push(inventoryStatus);
  }
  if (!scopeAllowsAssetWarehouse(scope, '显示器仓')) clauses.push('1=0');
  if (locationId) {
    clauses.push('a.location_id=?');
    binds.push(locationId);
  }
  applyDepartmentDataScopeClause(clauses, binds, 'a.department', scope);
  if (keyword) {
    const kw = buildKeywordWhere(keyword, {
      numericId: 'a.id',
      exact: ['a.asset_code', 'a.sn', 'a.employee_no'],
      prefix: ['a.asset_code', 'a.sn', 'a.brand', 'a.model', 'a.employee_name', 'a.department'],
      contains: [],
    });
    const fts = buildFtsKeywordWhere(keyword, {
      table: 'monitor_assets_fts',
      rowIdColumn: 'a.id',
    });
    const norm = buildNormalizedKeywordWhere(keyword, {
      column: 'a.search_text_norm',
      numericId: 'a.id',
      exact: ['a.asset_code', 'a.sn', 'a.employee_no'],
      preferFts: true,
    });
    const parts = [kw.sql, fts.sql, norm.sql].filter(Boolean);
    if (parts.length) {
      clauses.push(parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`);
      binds.push(...kw.binds, ...fts.binds, ...norm.binds);
    }
  }

  applyArchiveReasonFilter(clauses, binds, url);

  return {
    ...buildWhere(clauses, binds),
    page,
    pageSize,
    offset,
    fast: (url.searchParams.get('fast') || '').trim() === '1',
    joins: '',
  } satisfies QueryParts;
}

export async function countByWhere(db: D1Database, tableWithAlias: string, query: Pick<QueryParts, 'where' | 'binds' | 'joins'>) {
  await ensureSearchFtsTables(db);
  const row = await db.prepare(`SELECT COUNT(*) as c FROM ${tableWithAlias} ${query.joins || ''} ${query.where}`).bind(...query.binds).first<any>();
  return Number(row?.c || 0);
}

export async function listPcAssets(db: D1Database, query: QueryParts) {
  await ensureSearchFtsTables(db);
  const sql = `
    WITH page_a AS (
      SELECT a.id
      FROM pc_assets a
      ${query.joins || ''}
      ${query.where}
      ORDER BY a.id ASC
      LIMIT ? OFFSET ?
    )
    SELECT
      a.*,
      s.current_employee_no AS last_employee_no,
      s.current_employee_name AS last_employee_name,
      s.current_department AS last_department,
      s.last_config_date,
      s.last_recycle_date,
      s.last_out_at,
      s.last_in_at
    FROM pc_assets a
    JOIN page_a p ON p.id = a.id
    LEFT JOIN pc_asset_latest_state s ON s.asset_id = a.id
    ORDER BY a.id ASC
  `;
  const result = await db.prepare(sql).bind(...query.binds, query.pageSize, query.offset).all();
  return result.results || [];
}

export async function listMonitorAssets(db: D1Database, query: QueryParts) {
  await ensureSearchFtsTables(db);
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
    SET brand=?, serial_no=?, model=?, manufacture_date=?, warranty_end=?, manufacture_ts=?, warranty_end_ts=?, disk_capacity=?, memory_size=?, remark=?, search_text_norm=?, archived=0, updated_at=${sqlNowStored()}
    WHERE id=?
  `;
}

export function monitorAssetInsertSql() {
  return `
    INSERT INTO monitor_assets (asset_code, sn, brand, model, size_inch, remark, search_text_norm, status, location_id, archived, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?, 'IN_STOCK', ?, 0, ${sqlNowStored()}, ${sqlNowStored()})
  `;
}

export function monitorAssetUpdateSql() {
  return `
    UPDATE monitor_assets
    SET asset_code=?, sn=?, brand=?, model=?, size_inch=?, remark=?, search_text_norm=?, location_id=?, archived=0, updated_at=${sqlNowStored()}
    WHERE id=?
  `;
}
