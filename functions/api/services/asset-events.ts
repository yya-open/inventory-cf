import { toSqlRange } from '../_date';
import { buildKeywordWhere } from '../_search';
import { sqlBjDateTime } from '../_time';

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

export function buildPcTxQuery(url: URL): PcTxQuery {
  const type = (url.searchParams.get('type') || '').trim().toUpperCase();
  const keyword = (url.searchParams.get('keyword') || '').trim();
  const date_from = url.searchParams.get('date_from');
  const date_to = url.searchParams.get('date_to');
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
    orderBy:
      type === 'OUT'
        ? "ORDER BY (CASE WHEN x.config_date IS NULL OR x.config_date='' THEN x.created_at ELSE x.config_date END) DESC, x.created_at DESC, x.id DESC"
        : 'ORDER BY x.created_at DESC, x.id DESC',
  };
}

export async function countPcTxRows(db: D1Database, query: Pick<PcTxQuery, 'where' | 'binds'>) {
  const row = await db.prepare(`SELECT COUNT(*) as c FROM ( ${PC_TX_UNION_SQL} ) x ${query.where}`).bind(...query.binds).first<any>();
  return Number(row?.c || 0);
}

export async function listPcTxRows(db: D1Database, query: PcTxQuery) {
  const result = await db.prepare(`SELECT * FROM ( ${PC_TX_UNION_SQL} ) x ${query.where} ${query.orderBy} LIMIT ? OFFSET ?`).bind(...query.binds, query.pageSize, query.offset).all<any>();
  return result.results || [];
}

export type MonitorTxQuery = PagedQuery & {
  type: string;
  where: string;
  binds: any[];
};

export function buildMonitorTxQuery(url: URL): MonitorTxQuery {
  const type = (url.searchParams.get('type') || url.searchParams.get('tx_type') || '').trim().toUpperCase();
  const keyword = (url.searchParams.get('keyword') || '').trim();
  const date_from = url.searchParams.get('date_from') || url.searchParams.get('start') || url.searchParams.get('date_start');
  const date_to = url.searchParams.get('date_to') || url.searchParams.get('end') || url.searchParams.get('date_end');
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
      prefix: ['t.asset_code', 't.sn', 't.brand', 't.model', 't.employee_name', 't.department'],
      contains: ['t.remark', 't.employee_name', 't.department'],
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
  };
}

export async function countMonitorTxRows(db: D1Database, query: Pick<MonitorTxQuery, 'where' | 'binds'>) {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM monitor_tx t ${query.where}`).bind(...query.binds).first<any>();
  return Number(row?.c || 0);
}

export async function listMonitorTxRows(db: D1Database, query: MonitorTxQuery) {
  const sql = `
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
      t.employee_no,
      t.employee_name,
      t.department,
      t.is_employed,
      t.remark,
      t.created_at,
      t.created_by,
      fl.name AS from_location_name,
      tl.name AS to_location_name,
      fp.name AS from_parent_location_name,
      tp.name AS to_parent_location_name
    FROM monitor_tx t
    LEFT JOIN pc_locations fl ON fl.id = t.from_location_id
    LEFT JOIN pc_locations tl ON tl.id = t.to_location_id
    LEFT JOIN pc_locations fp ON fp.id = fl.parent_id
    LEFT JOIN pc_locations tp ON tp.id = tl.parent_id
    ${query.where}
    ORDER BY t.id DESC
    LIMIT ? OFFSET ?
  `;
  const result = await db.prepare(sql).bind(...query.binds, query.pageSize, query.offset).all<any>();
  return result.results || [];
}

export function buildMonitorTxExportSql(query: Pick<MonitorTxQuery, 'where'>) {
  const where = query.where ? `${query.where} AND t.id < ?` : 'WHERE t.id < ?';
  return `
    SELECT
      t.id,
      t.created_at,
      ${sqlBjDateTime('t.created_at')} AS created_at_bj,
      t.tx_no,
      t.tx_type,
      t.asset_code,
      t.sn,
      t.brand,
      t.model,
      t.size_inch,
      t.employee_no,
      t.employee_name,
      t.department,
      t.remark,
      t.created_by,
      fl.name AS from_location,
      tl.name AS to_location,
      fp.name AS from_parent_location,
      tp.name AS to_parent_location
    FROM monitor_tx t
    LEFT JOIN pc_locations fl ON fl.id = t.from_location_id
    LEFT JOIN pc_locations tl ON tl.id = t.to_location_id
    LEFT JOIN pc_locations fp ON fp.id = fl.parent_id
    LEFT JOIN pc_locations tp ON tp.id = tl.parent_id
    ${where}
    ORDER BY t.id DESC
    LIMIT ?
  `;
}

export type InventoryLogQuery = PagedQuery & {
  where: string;
  binds: any[];
  action: string;
  issue_type: string;
};

export function buildPcInventoryLogQuery(url: URL): InventoryLogQuery {
  const action = (url.searchParams.get('action') || '').trim().toUpperCase();
  const issue_type = (url.searchParams.get('issue_type') || '').trim().toUpperCase();
  const keyword = (url.searchParams.get('keyword') || '').trim();
  const date_from = url.searchParams.get('date_from');
  const date_to = url.searchParams.get('date_to');
  const wh: string[] = [];
  const binds: any[] = [];

  if (action === 'OK' || action === 'ISSUE') {
    wh.push('l.action=?');
    binds.push(action);
  }
  if (issue_type) {
    wh.push('l.issue_type=?');
    binds.push(issue_type);
  }
  if (keyword) {
    const kw = buildKeywordWhere(keyword, {
      numericId: 'l.id',
      exact: ['a.serial_no', 'o.employee_no'],
      prefix: ['a.serial_no', 'a.brand', 'a.model', 'o.employee_no', 'o.employee_name', 'o.department', 'l.action', 'l.issue_type', 'l.ip'],
      contains: ['a.remark', 'l.remark', 'o.employee_name', 'o.department', 'l.ua'],
    });
    if (kw.sql) {
      wh.push(kw.sql);
      binds.push(...kw.binds);
    }
  }
  const fromSql = toSqlRange(date_from, false);
  const toSql = toSqlRange(date_to, true);
  if (fromSql) {
    wh.push('l.created_at >= ?');
    binds.push(fromSql);
  }
  if (toSql) {
    wh.push('l.created_at <= ?');
    binds.push(toSql);
  }

  return {
    ...getPageParams(url),
    where: wh.length ? `WHERE ${wh.join(' AND ')}` : '',
    binds,
    action,
    issue_type,
  };
}

const PC_INVENTORY_LOG_COUNT_SQL = `
  WITH latest_out AS (
    SELECT asset_id, MAX(id) AS max_id
    FROM pc_out
    GROUP BY asset_id
  )
  SELECT COUNT(*) as c
  FROM pc_inventory_log l
  JOIN pc_assets a ON a.id = l.asset_id
  LEFT JOIN latest_out lo ON lo.asset_id = l.asset_id
  LEFT JOIN pc_out o ON o.id = lo.max_id
`;

export async function countPcInventoryLogRows(db: D1Database, query: Pick<InventoryLogQuery, 'where' | 'binds'>) {
  const row = await db.prepare(`${PC_INVENTORY_LOG_COUNT_SQL} ${query.where}`).bind(...query.binds).first<any>();
  return Number(row?.c || 0);
}

export async function listPcInventoryLogRows(db: D1Database, query: InventoryLogQuery) {
  const sql = `
    WITH page_l AS (
      SELECT l.id, l.asset_id, l.created_at
      FROM pc_inventory_log l
      JOIN pc_assets a ON a.id = l.asset_id
      LEFT JOIN (
        SELECT asset_id, MAX(id) AS max_id
        FROM pc_out
        GROUP BY asset_id
      ) lo0 ON lo0.asset_id = l.asset_id
      LEFT JOIN pc_out o ON o.id = lo0.max_id
      ${query.where}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ? OFFSET ?
    ),
    latest_out AS (
      SELECT asset_id, MAX(id) AS max_id
      FROM pc_out
      WHERE asset_id IN (SELECT DISTINCT asset_id FROM page_l)
      GROUP BY asset_id
    )
    SELECT
      l.id,
      l.asset_id,
      l.action,
      l.issue_type,
      l.remark,
      l.ip,
      l.ua,
      l.created_at,
      a.serial_no,
      a.brand,
      a.model,
      a.status,
      o.employee_no   AS last_employee_no,
      o.employee_name AS last_employee_name,
      o.department    AS last_department
    FROM pc_inventory_log l
    JOIN page_l p ON p.id = l.id
    JOIN pc_assets a ON a.id = l.asset_id
    LEFT JOIN latest_out lo ON lo.asset_id = l.asset_id
    LEFT JOIN pc_out o ON o.id = lo.max_id
    ORDER BY l.created_at DESC, l.id DESC
  `;
  const result = await db.prepare(sql).bind(...query.binds, query.pageSize, query.offset).all<any>();
  return result.results || [];
}

export function buildPcInventoryLogExportSql(query: Pick<InventoryLogQuery, 'where'>) {
  const where = query.where ? `${query.where} AND l.id < ?` : 'WHERE l.id < ?';
  return `
    WITH latest_out AS (
      SELECT asset_id, MAX(id) AS max_id
      FROM pc_out
      GROUP BY asset_id
    )
    SELECT
      l.id,
      l.created_at,
      ${sqlBjDateTime('l.created_at')} AS created_at_bj,
      l.action,
      l.issue_type,
      l.remark,
      l.ip,
      a.serial_no,
      a.brand,
      a.model,
      a.status,
      o.employee_no   AS employee_no,
      o.employee_name AS employee_name,
      o.department    AS department
    FROM pc_inventory_log l
    JOIN pc_assets a ON a.id = l.asset_id
    LEFT JOIN latest_out lo ON lo.asset_id = l.asset_id
    LEFT JOIN pc_out o ON o.id = lo.max_id
    ${where}
    ORDER BY l.id DESC
    LIMIT ?
  `;
}

export function buildMonitorInventoryLogQuery(url: URL): InventoryLogQuery {
  const action = (url.searchParams.get('action') || '').trim().toUpperCase();
  const issue_type = (url.searchParams.get('issue_type') || '').trim().toUpperCase();
  const keyword = (url.searchParams.get('keyword') || '').trim();
  const date_from = url.searchParams.get('date_from');
  const date_to = url.searchParams.get('date_to');
  const wh: string[] = [];
  const binds: any[] = [];

  if (action === 'OK' || action === 'ISSUE') {
    wh.push('l.action=?');
    binds.push(action);
  }
  if (issue_type) {
    wh.push('l.issue_type=?');
    binds.push(issue_type);
  }
  if (keyword) {
    const kw = buildKeywordWhere(keyword, {
      numericId: 'l.id',
      exact: ['a.asset_code', 'a.sn', 'a.employee_no'],
      prefix: ['a.asset_code', 'a.sn', 'a.brand', 'a.model', 'a.size_inch', 'a.employee_no', 'a.employee_name', 'a.department', 'l.action', 'l.issue_type', 'loc.name'],
      contains: ['a.remark', 'l.remark', 'l.ua'],
    });
    if (kw.sql) {
      wh.push(kw.sql);
      binds.push(...kw.binds);
    }
  }
  const fromSql = toSqlRange(date_from, false);
  const toSql = toSqlRange(date_to, true);
  if (fromSql) {
    wh.push('l.created_at >= ?');
    binds.push(fromSql);
  }
  if (toSql) {
    wh.push('l.created_at <= ?');
    binds.push(toSql);
  }

  return {
    ...getPageParams(url),
    where: wh.length ? `WHERE ${wh.join(' AND ')}` : '',
    binds,
    action,
    issue_type,
  };
}

export async function countMonitorInventoryLogRows(db: D1Database, query: Pick<InventoryLogQuery, 'where' | 'binds'>) {
  const row = await db.prepare(`SELECT COUNT(*) as c FROM monitor_inventory_log l JOIN monitor_assets a ON a.id = l.asset_id LEFT JOIN pc_locations loc ON loc.id = a.location_id ${query.where}`).bind(...query.binds).first<any>();
  return Number(row?.c || 0);
}

export async function listMonitorInventoryLogRows(db: D1Database, query: InventoryLogQuery) {
  const sql = `
    SELECT
      l.id,
      l.asset_id,
      l.action,
      l.issue_type,
      l.remark,
      l.ip,
      l.ua,
      l.created_at,
      a.asset_code,
      a.sn,
      a.brand,
      a.model,
      a.size_inch,
      a.status,
      loc.name AS location_name,
      a.employee_no,
      a.employee_name,
      a.department
    FROM monitor_inventory_log l
    JOIN monitor_assets a ON a.id = l.asset_id
    LEFT JOIN pc_locations loc ON loc.id = a.location_id
    ${query.where}
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT ? OFFSET ?
  `;
  const result = await db.prepare(sql).bind(...query.binds, query.pageSize, query.offset).all<any>();
  return result.results || [];
}

export function buildMonitorInventoryLogExportSql(query: Pick<InventoryLogQuery, 'where'>) {
  return `
    SELECT
      l.id,
      l.action,
      l.issue_type,
      l.remark,
      l.created_at,
      a.asset_code,
      a.sn,
      a.brand,
      a.model,
      a.size_inch,
      a.status,
      loc.name AS location_name,
      a.employee_no,
      a.employee_name,
      a.department
    FROM monitor_inventory_log l
    JOIN monitor_assets a ON a.id = l.asset_id
    LEFT JOIN pc_locations loc ON loc.id = a.location_id
    ${query.where}
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT ? OFFSET ?
  `;
}
