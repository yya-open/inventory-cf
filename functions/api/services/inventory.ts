import { toSqlRange } from '../_date';
import { buildKeywordWhere } from '../_search';
import { sqlBjDateTime, sqlNowStored } from '../_time';
import { resolveItemCategory } from './item-categories';

export type PagedQuery = {
  page: number;
  pageSize: number;
  offset: number;
};

export type ItemsListQuery = PagedQuery & {
  where: string;
  binds: any[];
  orderBy: string;
  sort_by: string;
  sort_dir: string;
  keyword_mode: string;
};

export type StockListQuery = PagedQuery & {
  warehouse_id: number;
  whereKw: string;
  binds: any[];
  orderBy: string;
  sort: string;
  keyword_mode: string;
  fast: boolean;
};

export type TxListQuery = PagedQuery & {
  where: string;
  binds: any[];
  bindsBase: any[];
  orderBy: string;
  sort_by: string;
  sort_dir: string;
  type: string;
  item_id: number | null;
  warehouse_id: number | null;
  keyword_mode: string;
  fast: boolean;
};

export type WarningsListQuery = PagedQuery & {
  warehouse_id: number;
  whereSql: string;
  binds: any[];
  orderBy: string;
  sort: string;
  category: string;
  only_alert: boolean;
  keyword_mode: string;
  fast: boolean;
};

export type ItemInput = {
  sku: string;
  name: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  unit: string;
  warning_qty: number;
};

function getPageParams(url: URL, defaultPageSize = 50, maxPageSize = 200): PagedQuery {
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(maxPageSize, Math.max(20, Number(url.searchParams.get('page_size') || defaultPageSize)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function normalizeSortDir(input: string) {
  return String(input || '').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC';
}

function normalizeKeyword(input: string) {
  return String(input || '').trim();
}

export function buildItemsListQuery(url: URL): ItemsListQuery {
  const keyword = normalizeKeyword(url.searchParams.get('keyword'));
  const sortByRaw = normalizeKeyword(url.searchParams.get('sort_by')) || 'id';
  const sortDirRaw = normalizeKeyword(url.searchParams.get('sort_dir')).toLowerCase() || 'desc';
  const sortDir = normalizeSortDir(sortDirRaw);
  const sortMap: Record<string, string> = {
    id: 'i.id',
    sku: 'i.sku',
    name: 'i.name',
    brand: 'i.brand',
    model: 'i.model',
    category: 'COALESCE(c.name, i.category)',
    warning_qty: 'i.warning_qty',
    created_at: 'i.created_at',
  };
  const sortCol = sortMap[sortByRaw] || 'i.id';

  const fast = String(url.searchParams.get('fast') || '').trim() === '1';
  const kw = buildKeywordWhere(keyword, {
    numericId: 'i.id',
    exact: ['i.sku'],
    prefix: ['i.sku', 'i.name'],
    contains: ['i.name', 'i.brand', 'i.model', 'i.category'],
  });

  return {
    ...getPageParams(url),
    where: kw.sql ? `WHERE i.enabled=1 AND ${kw.sql}` : 'WHERE i.enabled=1',
    binds: kw.binds,
    orderBy: `${sortCol} ${sortDir}, i.id DESC`,
    sort_by: sortByRaw,
    sort_dir: sortDirRaw,
    keyword_mode: kw.mode,
  };
}

export function parseItemInput(body: any): ItemInput {
  const sku = String(body?.sku || '').trim();
  const name = String(body?.name || '').trim();
  if (!sku || !name) {
    throw Object.assign(new Error('sku/name 必填'), { status: 400 });
  }
  return {
    sku,
    name,
    brand: body?.brand ? String(body.brand).trim() || null : null,
    model: body?.model ? String(body.model).trim() || null : null,
    category: body?.category ? String(body.category).trim() || null : null,
    unit: String(body?.unit || '个').trim() || '个',
    warning_qty: Number(body?.warning_qty || 0),
  };
}

export async function getItemById(db: D1Database, id: number) {
  return db.prepare(`SELECT i.*, COALESCE(c.name, i.category) AS category
                     FROM items i
                     LEFT JOIN item_categories c ON c.id = i.category_id
                     WHERE i.id=?`).bind(id).first<any>();
}

export async function assertItemSkuUnique(db: D1Database, sku: string, excludeId?: number | null) {
  const row = excludeId
    ? await db.prepare('SELECT id FROM items WHERE sku=? AND enabled=1 AND id<>? LIMIT 1').bind(sku, excludeId).first<any>()
    : await db.prepare('SELECT id FROM items WHERE sku=? AND enabled=1 LIMIT 1').bind(sku).first<any>();
  if (row?.id) {
    throw Object.assign(new Error('SKU 已存在'), { status: 400 });
  }
}

export async function createItem(db: D1Database, input: ItemInput) {
  const category = await resolveItemCategory(db, input.category);
  const existing = await db.prepare('SELECT id, enabled FROM items WHERE sku=? LIMIT 1').bind(input.sku).first<any>();
  if (existing?.id) {
    await db.prepare(
      'UPDATE items SET name=?, brand=?, model=?, category=?, category_id=?, unit=?, warning_qty=?, enabled=1 WHERE id=?'
    ).bind(input.name, input.brand, input.model, category.name, category.id, input.unit, input.warning_qty, existing.id).run();
    return Number(existing.id);
  }
  const result = await db.prepare(
    `INSERT INTO items (sku, name, brand, model, category, category_id, unit, warning_qty, created_at)
     VALUES (?,?,?,?,?,?,?,?, ${sqlNowStored()})`
  ).bind(input.sku, input.name, input.brand, input.model, category.name, category.id, input.unit, input.warning_qty).run();
  const last = (result as any)?.meta?.last_row_id;
  return typeof last === 'number' ? last : (last ? Number(last) : null);
}

export async function updateItem(db: D1Database, id: number, input: ItemInput) {
  const category = await resolveItemCategory(db, input.category);
  await db.prepare(
    'UPDATE items SET sku=?, name=?, brand=?, model=?, category=?, category_id=?, unit=?, warning_qty=? WHERE id=?'
  ).bind(input.sku, input.name, input.brand, input.model, category.name, category.id, input.unit, input.warning_qty, id).run();
}

export async function softDeleteItem(db: D1Database, id: number) {
  await db.prepare('UPDATE items SET enabled=0 WHERE id=?').bind(id).run();
}

export async function countItems(db: D1Database, query: Pick<ItemsListQuery, 'where' | 'binds'>) {
  const row = await db.prepare(`SELECT COUNT(*) as c FROM items i LEFT JOIN item_categories c ON c.id = i.category_id ${query.where}`).bind(...query.binds).first<any>();
  return Number(row?.c || 0);
}

export async function listItems(db: D1Database, query: ItemsListQuery) {
  const result = await db.prepare(`SELECT i.*, COALESCE(c.name, i.category) AS category
                                   FROM items i
                                   LEFT JOIN item_categories c ON c.id = i.category_id
                                   ${query.where}
                                   ORDER BY ${query.orderBy} LIMIT ? OFFSET ?`).bind(...query.binds, query.pageSize, query.offset).all<any>();
  return result.results || [];
}

export function buildStockListQuery(url: URL): StockListQuery {
  const keyword = normalizeKeyword(url.searchParams.get('keyword'));
  const warehouse_id = Number(url.searchParams.get('warehouse_id') || 1);
  const sort = normalizeKeyword(url.searchParams.get('sort')) || 'warning_first';
  const fast = String(url.searchParams.get('fast') || '').trim() === '1';
  const kw = buildKeywordWhere(keyword, {
    numericId: 'i.id',
    exact: ['i.sku'],
    prefix: ['i.sku', 'i.name'],
    contains: ['i.name', 'i.brand', 'i.model'],
  });
  const orderMap: Record<string, string> = {
    warning_first: 'is_warning DESC, i.id DESC',
    qty_asc: 'qty ASC, i.id DESC',
    qty_desc: 'qty DESC, i.id DESC',
    sku_asc: 'i.sku ASC, i.id DESC',
    name_asc: 'i.name ASC, i.id DESC',
    id_asc: 'i.id ASC',
    id_desc: 'i.id DESC',
  };

  return {
    ...getPageParams(url),
    warehouse_id,
    whereKw: kw.sql ? `AND ${kw.sql}` : '',
    binds: kw.binds,
    orderBy: orderMap[sort] || orderMap.warning_first,
    sort,
    keyword_mode: kw.mode,
    fast,
  };
}

export async function countStockRows(db: D1Database, query: StockListQuery) {
  const row = await db.prepare(`SELECT COUNT(*) as c FROM items i WHERE i.enabled=1 ${query.whereKw}`).bind(...query.binds).first<any>();
  return Number(row?.c || 0);
}

export async function listStockRows(db: D1Database, query: StockListQuery) {
  const sql = `
    SELECT
      i.id as item_id, i.sku, i.name, i.brand, i.model, i.category, i.unit, i.warning_qty,
      COALESCE(s.qty, 0) as qty,
      CASE WHEN COALESCE(s.qty,0) <= i.warning_qty THEN 1 ELSE 0 END as is_warning
    FROM items i
    LEFT JOIN stock s ON s.item_id = i.id AND s.warehouse_id = ?
    WHERE i.enabled=1 ${query.whereKw}
    ORDER BY ${query.orderBy}
    LIMIT ? OFFSET ?
  `;
  const result = await db.prepare(sql).bind(query.warehouse_id, ...query.binds, query.pageSize, query.offset).all<any>();
  return result.results || [];
}

export async function getStockForItem(db: D1Database, item_id: number, warehouse_id: number) {
  const row = await db.prepare(
    `SELECT i.id as item_id, i.warning_qty as warning_qty, COALESCE(s.qty, 0) as qty
     FROM items i
     LEFT JOIN stock s ON s.item_id = i.id AND s.warehouse_id = ?
     WHERE i.id = ? AND i.enabled = 1
     LIMIT 1`
  ).bind(warehouse_id, item_id).first<any>();
  return row || { item_id, warning_qty: 0, qty: 0 };
}

export function buildTxListQuery(url: URL, options: { includeKeyword?: boolean } = {}): TxListQuery {
  const type = normalizeKeyword(url.searchParams.get('type'));
  const item_id_raw = url.searchParams.get('item_id');
  const warehouse_id_raw = url.searchParams.get('warehouse_id');
  const item_id = item_id_raw ? Number(item_id_raw) : null;
  const warehouse_id = warehouse_id_raw ? Number(warehouse_id_raw) : null;
  const keyword = normalizeKeyword(url.searchParams.get('keyword'));
  const date_from = url.searchParams.get('date_from');
  const date_to = url.searchParams.get('date_to');
  const wh: string[] = [];
  const binds: any[] = [];
  let keyword_mode = 'none';

  if (type) {
    wh.push('t.type=?');
    binds.push(type);
  }
  if (item_id) {
    wh.push('t.item_id=?');
    binds.push(item_id);
  }
  if (warehouse_id && Number.isFinite(warehouse_id)) {
    wh.push('t.warehouse_id=?');
    binds.push(warehouse_id);
  }
  if (options.includeKeyword !== false && keyword) {
    const kw = buildKeywordWhere(keyword, {
      numericId: 't.id',
      exact: ['t.tx_no', 't.ref_no', 'i.sku'],
      prefix: ['t.tx_no', 't.ref_no', 'i.sku', 'i.name', 'w.name'],
      contains: ['i.name', 't.remark', 't.ref_no'],
    });
    if (kw.sql) {
      wh.push(kw.sql);
      binds.push(...kw.binds);
      keyword_mode = kw.mode;
    }
  }

  const fromSql = toSqlRange(date_from, false);
  const toSql = toSqlRange(date_to, true);
  if (fromSql) {
    wh.push('t.created_at >= ?');
    binds.push(fromSql);
  }
  if (toSql) {
    wh.push('t.created_at <= ?');
    binds.push(toSql);
  }

  const fast = String(url.searchParams.get('fast') || '').trim() === '1';
  const sortByRaw = normalizeKeyword(url.searchParams.get('sort_by')) || 'id';
  const sortDirRaw = normalizeKeyword(url.searchParams.get('sort_dir')).toLowerCase() || 'desc';
  const sortDir = normalizeSortDir(sortDirRaw);
  const sortMap: Record<string, string> = {
    id: 't.id',
    created_at: 't.created_at',
    tx_no: 't.tx_no',
    type: 't.type',
    sku: 'i.sku',
    name: 'i.name',
    warehouse: 'w.name',
    qty: 't.qty',
  };

  return {
    ...getPageParams(url),
    where: wh.length ? `WHERE ${wh.join(' AND ')}` : '',
    binds,
    bindsBase: [...binds],
    orderBy: `${sortMap[sortByRaw] || 't.id'} ${sortDir}, t.id DESC`,
    sort_by: sortByRaw,
    sort_dir: sortDirRaw,
    type,
    item_id,
    warehouse_id,
    keyword_mode,
    fast,
  };
}

export async function countTxRows(db: D1Database, query: TxListQuery) {
  const row = await db.prepare(
    `SELECT COUNT(*) as c
     FROM stock_tx t
     JOIN items i ON i.id=t.item_id
     JOIN warehouses w ON w.id=t.warehouse_id
     ${query.where}`
  ).bind(...query.binds).first<any>();
  return Number(row?.c || 0);
}

export async function listTxRows(db: D1Database, query: TxListQuery) {
  const sql = `
    SELECT t.*, datetime(t.created_at, '+8 hours') AS created_at_bj, i.sku, i.name, i.unit, w.name as warehouse_name
    FROM stock_tx t
    JOIN items i ON i.id=t.item_id
    JOIN warehouses w ON w.id=t.warehouse_id
    ${query.where}
    ORDER BY ${query.orderBy}
    LIMIT ? OFFSET ?
  `;
  const result = await db.prepare(sql).bind(...query.binds, query.pageSize, query.offset).all<any>();
  return result.results || [];
}

export function buildTxExportSql(query: TxListQuery) {
  const where = query.where ? `${query.where} AND t.id < ?` : 'WHERE t.id < ?';
  return `
    SELECT t.id, t.created_at, datetime(t.created_at, '+8 hours') AS created_at_bj, t.tx_no, t.type, t.qty, t.delta_qty, t.source, t.target, t.remark,
           i.sku, i.name, w.name as warehouse_name
    FROM stock_tx t
    JOIN items i ON i.id=t.item_id
    JOIN warehouses w ON w.id=t.warehouse_id
    ${where}
    ORDER BY t.id DESC
    LIMIT ?
  `;
}

function buildWarningsOrder(sort: string) {
  switch (sort) {
    case 'gap_asc':
      return 'gap ASC, qty ASC, i.id DESC';
    case 'qty_asc':
      return 'qty ASC, gap DESC, i.id DESC';
    case 'sku_asc':
      return 'i.sku ASC, i.id DESC';
    case 'name_asc':
      return 'i.name ASC, i.id DESC';
    case 'gap_desc':
    default:
      return 'gap DESC, qty ASC, i.id DESC';
  }
}

export function buildWarningsQuery(url: URL): WarningsListQuery {
  const warehouse_id = Number(url.searchParams.get('warehouse_id') || 1);
  const category = normalizeKeyword(url.searchParams.get('category'));
  const keyword = normalizeKeyword(url.searchParams.get('keyword'));
  const only_alert = (url.searchParams.get('only_alert') ?? '1') !== '0';
  const sort = normalizeKeyword(url.searchParams.get('sort')) || 'gap_desc';
  const fast = String(url.searchParams.get('fast') || '').trim() === '1';
  const whereParts: string[] = ['i.enabled=1'];
  const binds: any[] = [];
  let keyword_mode = 'none';

  if (only_alert) {
    whereParts.push('COALESCE(s.qty,0) <= COALESCE(i.warning_qty,0)');
  }
  if (category) {
    whereParts.push('i.category = ?');
    binds.push(category);
  }
  if (keyword) {
    const kw = buildKeywordWhere(keyword, {
      numericId: 'i.id',
      exact: ['i.sku'],
      prefix: ['i.sku', 'i.name'],
      contains: ['i.name', 'i.brand', 'i.model'],
    });
    if (kw.sql) {
      whereParts.push(kw.sql);
      binds.push(...kw.binds);
      keyword_mode = kw.mode;
    }
  }

  return {
    ...getPageParams(url),
    warehouse_id,
    whereSql: whereParts.join(' AND '),
    binds,
    orderBy: buildWarningsOrder(sort),
    sort,
    category,
    only_alert,
    keyword_mode,
    fast,
  };
}

export function buildWarningsBaseSql() {
  return `
    WITH latest_tx AS (
      SELECT
        tx.item_id,
        tx.created_at,
        ROW_NUMBER() OVER (PARTITION BY tx.item_id ORDER BY tx.created_at DESC, tx.id DESC) AS rn
      FROM stock_tx tx
      WHERE tx.warehouse_id=?
    )
    SELECT
      i.id as item_id,
      i.sku, i.name, i.brand, i.model, i.category, i.unit,
      COALESCE(i.warning_qty,0) as warning_qty,
      COALESCE(s.qty,0) as qty,
      (COALESCE(i.warning_qty,0) - COALESCE(s.qty,0)) as gap,
      lt.created_at as last_tx_at
    FROM items i
    LEFT JOIN stock s ON s.item_id=i.id AND s.warehouse_id=?
    LEFT JOIN latest_tx lt ON lt.item_id=i.id AND lt.rn=1
    WHERE %WHERE%
  `;
}

export async function countWarningsRows(db: D1Database, query: WarningsListQuery) {
  const countSql = `
    SELECT COUNT(*) as c
    FROM items i
    LEFT JOIN stock s ON s.item_id=i.id AND s.warehouse_id=?
    WHERE ${query.whereSql}
  `;
  const row = await db.prepare(countSql).bind(query.warehouse_id, ...query.binds).first<any>();
  return Number(row?.c || 0);
}

export async function listWarningsRows(db: D1Database, query: WarningsListQuery) {
  const sql = `${buildWarningsBaseSql().replace('%WHERE%', query.whereSql)} ORDER BY ${query.orderBy} LIMIT ? OFFSET ?`;
  const result = await db.prepare(sql).bind(query.warehouse_id, query.warehouse_id, ...query.binds, query.pageSize, query.offset).all<any>();
  return result.results || [];
}

export async function listWarningsExportRows(db: D1Database, query: WarningsListQuery) {
  const sql = `
    WITH latest_tx AS (
      SELECT
        tx.item_id,
        tx.created_at,
        ROW_NUMBER() OVER (PARTITION BY tx.item_id ORDER BY tx.created_at DESC, tx.id DESC) AS rn
      FROM stock_tx tx
      WHERE tx.warehouse_id=?
    )
    SELECT
      i.sku, i.name, i.brand, i.model, i.category,
      COALESCE(s.qty,0) as qty,
      COALESCE(i.warning_qty,0) as warning_qty,
      (COALESCE(i.warning_qty,0) - COALESCE(s.qty,0)) as gap,
      lt.created_at as last_tx_at,
      ${sqlBjDateTime('lt.created_at')} as last_tx_at_bj
    FROM items i
    LEFT JOIN stock s ON s.item_id=i.id AND s.warehouse_id=?
    LEFT JOIN latest_tx lt ON lt.item_id=i.id AND lt.rn=1
    WHERE ${query.whereSql}
    ORDER BY ${query.orderBy}
  `;
  const result = await db.prepare(sql).bind(query.warehouse_id, query.warehouse_id, ...query.binds).all<any>();
  return result.results || [];
}

export async function getWarehouseName(db: D1Database, warehouse_id: number) {
  const row = await db.prepare('SELECT name FROM warehouses WHERE id=?').bind(warehouse_id).first<{ name: string }>();
  return row?.name || `仓库#${warehouse_id}`;
}
