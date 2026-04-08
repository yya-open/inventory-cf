import { toSqlRange } from '../_date';
import { buildKeywordWhere } from '../_search';
import { sqlBjDateTime } from '../_time';
import { ensurePcLatestStateTable } from './pc-latest-state';
import { ensureMonitorLatestStateTable } from './monitor-latest-state';

type PagedQuery = {
  page: number;
  pageSize: number;
  offset: number;
  fast: boolean;
};

function getPageParams(url: URL, defaultPageSize = 50, maxPageSize = 200): PagedQuery {
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(maxPageSize, Math.max(20, Number(url.searchParams.get('page_size') || defaultPageSize)));
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    fast: (url.searchParams.get('fast') || '').trim() === '1',
  };
}

export type PcTxQuery = PagedQuery & {
  type: string;
  where: string;
  binds: any[];
  orderBy: string;
  effective: '' | 'current' | 'history';
};

const PC_TX_UNION_SQL = `
  SELECT
    'IN' AS type,
    i.id AS id,
    i.in_no AS tx_no,
    i.asset_id,
    NULL AS employee_no,
    NULL AS department,
    NULL AS employee_name,
    NULL AS is_employed,
    i.brand, i.serial_no, i.model,
    NULL AS config_date,
    i.manufacture_date,
    i.warranty_end,
    i.disk_capacity,
    i.memory_size,
    i.remark,
    NULL AS recycle_date,
    i.created_at,
    i.created_by
  FROM pc_in i
  UNION ALL
  SELECT
    'OUT' AS type,
    o.id AS id,
    o.out_no AS tx_no,
    o.asset_id,
    o.employee_no,
    o.department,
    o.employee_name,
    o.is_employed,
    o.brand, o.serial_no, o.model,
    o.config_date,
    o.manufacture_date,
    o.warranty_end,
    o.disk_capacity,
    o.memory_size,
    o.remark,
    o.recycle_date,
    o.created_at,
    o.created_by
  FROM pc_out o
  UNION ALL
  SELECT
    r.action AS type,
    r.id AS id,
    r.recycle_no AS tx_no,
    r.asset_id,
    r.employee_no,
    r.department,
    r.employee_name,
    r.is_employed,
    r.brand, r.serial_no, r.model,
    NULL AS config_date,
    NULL AS manufacture_date,
    NULL AS warranty_end,
    NULL AS disk_capacity,
    NULL AS memory_size,
    r.remark,
    r.recycle_date,
    r.created_at,
    r.created_by
  FROM pc_recycle r
  UNION ALL
  SELECT
    'SCRAP' AS type,
    s.id AS id,
    s.scrap_no AS tx_no,
    s.asset_id,
    NULL AS employee_no,
    NULL AS department,
    NULL AS employee_name,
    NULL AS is_employed,
    s.brand, s.serial_no, s.model,
    NULL AS config_date,
    s.manufacture_date,
    s.warranty_end,
    s.disk_capacity,
    s.memory_size,
    COALESCE(s.reason, s.remark) AS remark,
    s.scrap_date AS recycle_date,
    s.created_at,
    s.created_by
  FROM pc_scrap s
`;

function buildPcEffectiveWhere(effective: '' | 'current' | 'history') {
  if (effective === 'current') return 'WHERE y.is_current_effective = 1';
  if (effective === 'history') return 'WHERE y.is_current_effective = 0';
  return '';
}

function buildPcEffectiveScope(queryWhere: string) {
  return `
    WITH tx AS ( ${PC_TX_UNION_SQL} ),
    scoped AS (
      SELECT
        x.*,
        CASE
          WHEN s.asset_id IS NOT NULL AND s.current_tx_type = x.type AND s.current_tx_id = x.id THEN 1
          ELSE 0
        END AS is_current_effective,
        ${sqlBjDateTime('x.created_at')} AS created_at_bj
      FROM tx x
      LEFT JOIN pc_asset_latest_state s ON s.asset_id = x.asset_id
      ${queryWhere}
    )
  `;
}

export function buildPcTxQuery(url: URL): PcTxQuery {
  const type = (url.searchParams.get('type') || '').trim().toUpperCase();
  const keyword = (url.searchParams.get('keyword') || '').trim();
  const date_from = url.searchParams.get('date_from');
  const date_to = url.searchParams.get('date_to');
  const effective = (url.searchParams.get('effective') || '').trim().toLowerCase() === 'current'
    ? 'current'
    : (url.searchParams.get('effective') || '').trim().toLowerCase() === 'history'
      ? 'history'
      : '';
  const wh: string[] = [];
  const binds: any[] = [];

  if (['IN', 'OUT', 'RETURN', 'RECYCLE', 'SCRAP'].includes(type)) {
    wh.push('x.type=?');
    binds.push(type);
  }

  if (keyword) {
    const kw = buildKeywordWhere(keyword, {
      numericId: 'x.id',
      exact: ['x.tx_no', 'x.serial_no', 'x.employee_no'],
      prefix: ['x.tx_no', 'x.serial_no', 'x.brand', 'x.model', 'x.employee_no', 'x.employee_name', 'x.department'],
      contains: ['x.remark', 'x.brand', 'x.model', 'x.employee_name', 'x.department'],
    });
    if (kw.sql) {
      wh.push(kw.sql);
      binds.push(...kw.binds);
    }
  }

  const fromSql = toSqlRange(date_from, false);
  const toSql = toSqlRange(date_to, true);
  if (fromSql) {
    wh.push('x.created_at >= ?');
    binds.push(fromSql);
  }
  if (toSql) {
    wh.push('x.created_at <= ?');
    binds.push(toSql);
  }

  return {
    ...getPageParams(url),
    type,
    where: wh.length ? `WHERE ${wh.join(' AND ')}` : '',
    binds,
    effective,
    orderBy:
      type === 'OUT'
        ? "ORDER BY (CASE WHEN y.config_date IS NULL OR y.config_date='' THEN y.created_at ELSE y.config_date END) DESC, y.created_at DESC, y.id DESC"
        : 'ORDER BY y.created_at DESC, y.id DESC',
  };
}

export async function countPcTxRows(db: D1Database, query: Pick<PcTxQuery, 'where' | 'binds' | 'effective'>) {
  await ensurePcLatestStateTable(db);
  const row = await db.prepare(`
    ${buildPcEffectiveScope(query.where)}
    SELECT COUNT(*) as c
    FROM scoped y
    ${buildPcEffectiveWhere(query.effective)}
  `).bind(...query.binds).first<any>();
  return Number(row?.c || 0);
}

export async function listPcTxRows(db: D1Database, query: PcTxQuery) {
  await ensurePcLatestStateTable(db);
  const sql = `
    ${buildPcEffectiveScope(query.where)}
    SELECT y.*
    FROM scoped y
    ${buildPcEffectiveWhere(query.effective)}
    ${query.orderBy}
    LIMIT ? OFFSET ?
  `;
  const result = await db.prepare(sql).bind(...query.binds, query.pageSize, query.offset).all<any>();
  return result.results || [];
}

export type MonitorTxQuery = PagedQuery & {
  type: string;
  where: string;
  binds: any[];
  effective: '' | 'current' | 'history';
};

function buildMonitorEffectiveWhere(effective: '' | 'current' | 'history') {
  if (effective === 'current') return 'WHERE y.is_current_effective = 1';
  if (effective === 'history') return 'WHERE y.is_current_effective = 0';
  return '';
}

function buildMonitorScopedSql(queryWhere: string) {
  return `
    WITH scoped AS (
      SELECT
        t.id,
        t.tx_no,
        t.tx_type,
        t.asset_id,
        t.asset_code,
        t.sn,
        t.brand,
        t.model,
        t.size_inch,
        t.from_location_id,
        t.to_location_id,
        fl.name AS from_location,
        tl.name AS to_location,
        fp.name AS from_parent_location,
        tp.name AS to_parent_location,
        t.employee_no,
        t.employee_name,
        t.department,
        t.is_employed,
        t.remark,
        t.created_by,
        t.created_at,
        ${sqlBjDateTime('t.created_at')} AS created_at_bj,
        CASE
          WHEN s.asset_id IS NOT NULL AND s.current_tx_type = t.tx_type AND s.current_tx_id = t.id THEN 1
          ELSE 0
        END AS is_current_effective
      FROM monitor_tx t
      LEFT JOIN monitor_asset_latest_state s ON s.asset_id = t.asset_id
      LEFT JOIN pc_locations fl ON fl.id = t.from_location_id
      LEFT JOIN pc_locations tl ON tl.id = t.to_location_id
      LEFT JOIN pc_locations fp ON fp.id = fl.parent_id
      LEFT JOIN pc_locations tp ON tp.id = tl.parent_id
      ${queryWhere}
    )
  `;
}

export function buildMonitorTxQuery(url: URL): MonitorTxQuery {
  const type = (url.searchParams.get('type') || url.searchParams.get('tx_type') || '').trim().toUpperCase();
  const keyword = (url.searchParams.get('keyword') || '').trim();
  const date_from = url.searchParams.get('date_from') || url.searchParams.get('start') || url.searchParams.get('date_start');
  const date_to = url.searchParams.get('date_to') || url.searchParams.get('end') || url.searchParams.get('date_end');
  const effective = (url.searchParams.get('effective') || '').trim().toLowerCase() === 'current'
    ? 'current'
    : (url.searchParams.get('effective') || '').trim().toLowerCase() === 'history'
      ? 'history'
      : '';
  const wh: string[] = [];
  const binds: any[] = [];

  if (type) {
    wh.push('t.tx_type=?');
    binds.push(type);
  }
  const fromSql = toSqlRange(date_from, false);
  const toSql = toSqlRange(date_to, true);
  if (fromSql) {
    wh.push('t.created_at>=?');
    binds.push(fromSql);
  }
  if (toSql) {
    wh.push('t.created_at<=?');
    binds.push(toSql);
  }
  if (keyword) {
    const kw = buildKeywordWhere(keyword, {
      numericId: 't.id',
      exact: ['t.tx_no', 't.asset_code', 't.sn', 't.employee_no'],
      prefix: ['t.tx_no', 't.asset_code', 't.sn', 't.brand', 't.model', 't.employee_name', 't.department'],
      contains: ['t.remark', 't.employee_name', 't.department', 't.brand', 't.model'],
    });
    if (kw.sql) {
      wh.push(kw.sql);
      binds.push(...kw.binds);
    }
  }

  return {
    ...getPageParams(url),
    type,
    where: wh.length ? `WHERE ${wh.join(' AND ')}` : '',
    binds,
    effective,
  };
}

export async function countMonitorTxRows(db: D1Database, query: Pick<MonitorTxQuery, 'where' | 'binds' | 'effective'>) {
  await ensureMonitorLatestStateTable(db);
  const row = await db.prepare(`
    ${buildMonitorScopedSql(query.where)}
    SELECT COUNT(*) AS c
    FROM scoped y
    ${buildMonitorEffectiveWhere(query.effective)}
  `).bind(...query.binds).first<any>();
  return Number(row?.c || 0);
}

export async function listMonitorTxRows(db: D1Database, query: MonitorTxQuery) {
  await ensureMonitorLatestStateTable(db);
  const sql = `
    ${buildMonitorScopedSql(query.where)}
    SELECT y.*
    FROM scoped y
    ${buildMonitorEffectiveWhere(query.effective)}
    ORDER BY y.created_at DESC, y.id DESC
    LIMIT ? OFFSET ?
  `;
  const result = await db.prepare(sql).bind(...query.binds, query.pageSize, query.offset).all<any>();
  return result.results || [];
}

export function buildMonitorTxExportSql(query: Pick<MonitorTxQuery, 'where'>) {
  return `
    ${buildMonitorScopedSql(query.where)}
    SELECT y.*
    FROM scoped y
    WHERE y.id < ?
    ORDER BY y.id DESC
    LIMIT ?
  `;
}
