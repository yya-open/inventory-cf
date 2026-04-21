import { buildKeywordWhere, buildNormalizedKeywordWhere, normalizeSearchText } from '../_search';
import { buildFtsKeywordWhere, ensureSearchFtsTables } from './search-fts';
import { must, optional } from '../_pc';
import { sqlNowStored } from '../_time';
import { applyDepartmentDataScopeClause, getRequiredDepartment, scopeAllowsAssetWarehouse, type UserDataScope } from './data-scope';

export type QueryParts = { where: string; binds: any[]; page: number; pageSize: number; offset: number; fast: boolean; joins?: string; usesFts?: boolean };

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
  if (archiveMode === 'archived') clauses.push('a.archived=1');
  else if (archiveMode === 'all' || showArchived) { /* include both */ }
  else clauses.push('a.archived=0');
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

  const needsDepartmentJoin = Boolean(getRequiredDepartment(scope));
  return {
    ...buildWhere(clauses, binds),
    page,
    pageSize,
    offset,
    fast: (url.searchParams.get('fast') || '').trim() === '1',
    joins: needsDepartmentJoin ? 'LEFT JOIN pc_asset_latest_state s ON s.asset_id=a.id' : '',
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
  if (archiveMode === 'archived') clauses.push('a.archived=1');
  else if (archiveMode === 'all' || showArchived) { /* include both */ }
  else clauses.push('a.archived=0');
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
    usesFts: Boolean(keyword),
  } satisfies QueryParts;
}

export async function countByWhere(db: D1Database, tableWithAlias: string, query: Pick<QueryParts, 'where' | 'binds' | 'joins' | 'usesFts'>) {
  if (query.usesFts) await ensureSearchFtsTables(db);
  const row = await db.prepare(`SELECT COUNT(*) as c FROM ${tableWithAlias} ${query.joins || ''} ${query.where}`).bind(...query.binds).first<any>();
  return Number(row?.c || 0);
}

export async function listPcAssets(db: D1Database, query: QueryParts) {
  if (query.usesFts) await ensureSearchFtsTables(db);
  if (query.fast) {
    const idSql = `
      SELECT a.id
      FROM pc_assets a
      ${query.joins || ''}
      ${query.where}
      ORDER BY a.id ASC
      LIMIT ? OFFSET ?
    `;
    const idResult = await db.prepare(idSql).bind(...query.binds, query.pageSize, query.offset).all();
    const ids = (idResult.results || []).map((item: any) => Number(item?.id || 0)).filter((id: number) => id > 0);
    if (!ids.length) return [];

    const placeholders = ids.map(() => '?').join(',');
    const rowsSql = `
      SELECT a.*
      FROM pc_assets a
      WHERE a.id IN (${placeholders})
      ORDER BY a.id ASC
    `;
    const stateSql = `
      SELECT
        s.asset_id,
        s.current_employee_no,
        s.current_employee_name,
        s.current_department,
        s.last_config_date,
        s.last_recycle_date,
        s.last_out_at,
        s.last_in_at
      FROM pc_asset_latest_state s
      WHERE s.asset_id IN (${placeholders})
    `;
    const [rowsResult, stateResult] = await Promise.all([
      db.prepare(rowsSql).bind(...ids).all(),
      db.prepare(stateSql).bind(...ids).all(),
    ]);
    const stateMap = new Map<number, any>();
    for (const item of stateResult.results || []) stateMap.set(Number((item as any)?.asset_id || 0), item);
    return (rowsResult.results || []).map((row: any) => {
      const state = stateMap.get(Number(row?.id || 0)) || {};
      return {
        ...row,
        last_employee_no: state.current_employee_no || '',
        last_employee_name: state.current_employee_name || '',
        last_department: state.current_department || '',
        last_config_date: state.last_config_date || null,
        last_recycle_date: state.last_recycle_date || null,
        last_out_at: state.last_out_at || null,
        last_in_at: state.last_in_at || null,
        previous_employee_no: null,
        previous_employee_name: null,
        previous_department: null,
        previous_assigned_at: null,
      };
    });
  }
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
      s.last_in_at,
      (
        SELECT o.employee_no
        FROM pc_out o
        WHERE o.asset_id = a.id
          AND (COALESCE(o.employee_no, '') <> '' OR COALESCE(o.employee_name, '') <> '' OR COALESCE(o.department, '') <> '')
          AND (
            a.status <> 'ASSIGNED'
            OR COALESCE(o.employee_no, '') <> COALESCE(s.current_employee_no, '')
            OR COALESCE(o.employee_name, '') <> COALESCE(s.current_employee_name, '')
            OR COALESCE(o.department, '') <> COALESCE(s.current_department, '')
          )
        ORDER BY COALESCE(NULLIF(o.config_date, ''), o.created_at) DESC, o.created_at DESC, o.id DESC
        LIMIT 1
      ) AS previous_employee_no,
      (
        SELECT o.employee_name
        FROM pc_out o
        WHERE o.asset_id = a.id
          AND (COALESCE(o.employee_no, '') <> '' OR COALESCE(o.employee_name, '') <> '' OR COALESCE(o.department, '') <> '')
          AND (
            a.status <> 'ASSIGNED'
            OR COALESCE(o.employee_no, '') <> COALESCE(s.current_employee_no, '')
            OR COALESCE(o.employee_name, '') <> COALESCE(s.current_employee_name, '')
            OR COALESCE(o.department, '') <> COALESCE(s.current_department, '')
          )
        ORDER BY COALESCE(NULLIF(o.config_date, ''), o.created_at) DESC, o.created_at DESC, o.id DESC
        LIMIT 1
      ) AS previous_employee_name,
      (
        SELECT o.department
        FROM pc_out o
        WHERE o.asset_id = a.id
          AND (COALESCE(o.employee_no, '') <> '' OR COALESCE(o.employee_name, '') <> '' OR COALESCE(o.department, '') <> '')
          AND (
            a.status <> 'ASSIGNED'
            OR COALESCE(o.employee_no, '') <> COALESCE(s.current_employee_no, '')
            OR COALESCE(o.employee_name, '') <> COALESCE(s.current_employee_name, '')
            OR COALESCE(o.department, '') <> COALESCE(s.current_department, '')
          )
        ORDER BY COALESCE(NULLIF(o.config_date, ''), o.created_at) DESC, o.created_at DESC, o.id DESC
        LIMIT 1
      ) AS previous_department,
      (
        SELECT COALESCE(NULLIF(o.config_date, ''), o.created_at)
        FROM pc_out o
        WHERE o.asset_id = a.id
          AND (COALESCE(o.employee_no, '') <> '' OR COALESCE(o.employee_name, '') <> '' OR COALESCE(o.department, '') <> '')
          AND (
            a.status <> 'ASSIGNED'
            OR COALESCE(o.employee_no, '') <> COALESCE(s.current_employee_no, '')
            OR COALESCE(o.employee_name, '') <> COALESCE(s.current_employee_name, '')
            OR COALESCE(o.department, '') <> COALESCE(s.current_department, '')
          )
        ORDER BY COALESCE(NULLIF(o.config_date, ''), o.created_at) DESC, o.created_at DESC, o.id DESC
        LIMIT 1
      ) AS previous_assigned_at
    FROM pc_assets a
    JOIN page_a p ON p.id = a.id
    LEFT JOIN pc_asset_latest_state s ON s.asset_id = a.id
    ORDER BY a.id ASC
  `;
  const result = await db.prepare(sql).bind(...query.binds, query.pageSize, query.offset).all();
  return result.results || [];
}

export async function listMonitorAssets(db: D1Database, query: QueryParts) {
  if (query.usesFts) await ensureSearchFtsTables(db);
  if (query.fast) {
    const sql = `
      WITH page_a AS (
        SELECT a.id
        FROM monitor_assets a
        ${query.where}
        ORDER BY a.id ASC
        LIMIT ? OFFSET ?
      )
      SELECT
        a.*,
        l.name AS location_name,
        p.name AS parent_location_name,
        NULL AS previous_employee_no,
        NULL AS previous_employee_name,
        NULL AS previous_department,
        NULL AS previous_assigned_at
      FROM monitor_assets a
      JOIN page_a pg ON pg.id = a.id
      LEFT JOIN pc_locations l ON l.id = a.location_id
      LEFT JOIN pc_locations p ON p.id = l.parent_id
      ORDER BY a.id ASC
    `;
    const result = await db.prepare(sql).bind(...query.binds, query.pageSize, query.offset).all();
    return result.results || [];
  }
  const sql = `
    SELECT
      a.*,
      l.name AS location_name,
      p.name AS parent_location_name,
      (
        SELECT t.employee_no
        FROM monitor_tx t
        WHERE t.asset_id = a.id
          AND t.tx_type IN ('OUT', 'TRANSFER')
          AND (COALESCE(t.employee_no, '') <> '' OR COALESCE(t.employee_name, '') <> '' OR COALESCE(t.department, '') <> '')
          AND (
            a.status <> 'ASSIGNED'
            OR COALESCE(t.employee_no, '') <> COALESCE(a.employee_no, '')
            OR COALESCE(t.employee_name, '') <> COALESCE(a.employee_name, '')
            OR COALESCE(t.department, '') <> COALESCE(a.department, '')
          )
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT 1
      ) AS previous_employee_no,
      (
        SELECT t.employee_name
        FROM monitor_tx t
        WHERE t.asset_id = a.id
          AND t.tx_type IN ('OUT', 'TRANSFER')
          AND (COALESCE(t.employee_no, '') <> '' OR COALESCE(t.employee_name, '') <> '' OR COALESCE(t.department, '') <> '')
          AND (
            a.status <> 'ASSIGNED'
            OR COALESCE(t.employee_no, '') <> COALESCE(a.employee_no, '')
            OR COALESCE(t.employee_name, '') <> COALESCE(a.employee_name, '')
            OR COALESCE(t.department, '') <> COALESCE(a.department, '')
          )
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT 1
      ) AS previous_employee_name,
      (
        SELECT t.department
        FROM monitor_tx t
        WHERE t.asset_id = a.id
          AND t.tx_type IN ('OUT', 'TRANSFER')
          AND (COALESCE(t.employee_no, '') <> '' OR COALESCE(t.employee_name, '') <> '' OR COALESCE(t.department, '') <> '')
          AND (
            a.status <> 'ASSIGNED'
            OR COALESCE(t.employee_no, '') <> COALESCE(a.employee_no, '')
            OR COALESCE(t.employee_name, '') <> COALESCE(a.employee_name, '')
            OR COALESCE(t.department, '') <> COALESCE(a.department, '')
          )
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT 1
      ) AS previous_department,
      (
        SELECT t.created_at
        FROM monitor_tx t
        WHERE t.asset_id = a.id
          AND t.tx_type IN ('OUT', 'TRANSFER')
          AND (COALESCE(t.employee_no, '') <> '' OR COALESCE(t.employee_name, '') <> '' OR COALESCE(t.department, '') <> '')
          AND (
            a.status <> 'ASSIGNED'
            OR COALESCE(t.employee_no, '') <> COALESCE(a.employee_no, '')
            OR COALESCE(t.employee_name, '') <> COALESCE(a.employee_name, '')
            OR COALESCE(t.department, '') <> COALESCE(a.department, '')
          )
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT 1
      ) AS previous_assigned_at
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
