import { buildKeywordWhere } from '../_search';
import { sqlNowStored } from '../_time';

type PagedQuery = {
  page: number;
  pageSize: number;
  offset: number;
};

function getPageParams(url: URL, defaultPageSize = 50, maxPageSize = 200): PagedQuery {
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(maxPageSize, Math.max(20, Number(url.searchParams.get('page_size') || defaultPageSize)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export type StocktakeListQuery = PagedQuery & {
  where: string;
  binds: any[];
  sort_by: string;
  sort_dir: string;
  orderBy: string;
};

export function generateStocktakeNo(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `ST${get('year')}${get('month')}${get('day')}-${rand}`;
}

export function buildStocktakeListQuery(url: URL): StocktakeListQuery {
  const warehouse_id = url.searchParams.get('warehouse_id');
  const status = (url.searchParams.get('status') || '').trim();
  const keyword = (url.searchParams.get('keyword') || '').trim();
  const wh: string[] = ['1=1'];
  const binds: any[] = [];

  if (warehouse_id) {
    wh.push('s.warehouse_id=?');
    binds.push(Number(warehouse_id));
  }
  if (status) {
    wh.push('s.status=?');
    binds.push(status);
  }
  if (keyword) {
    const kw = buildKeywordWhere(keyword, {
      numericId: 's.id',
      exact: ['s.st_no'],
      prefix: ['s.st_no', 's.status'],
      contains: ['s.st_no', 's.status'],
    });
    if (kw.sql) {
      wh.push(kw.sql);
      binds.push(...kw.binds);
    }
  }

  const sortByRaw = (url.searchParams.get('sort_by') || 'id').trim();
  const sortDirRaw = (url.searchParams.get('sort_dir') || 'asc').trim().toLowerCase();
  const sortDir = sortDirRaw === 'desc' ? 'DESC' : 'ASC';
  const sortMap: Record<string, string> = {
    id: 's.id',
    st_no: 's.st_no',
    created_at: 's.created_at',
    status: 's.status',
  };
  const sortCol = sortMap[sortByRaw] || 's.id';

  return {
    ...getPageParams(url),
    where: `WHERE ${wh.join(' AND ')}`,
    binds,
    sort_by: sortByRaw,
    sort_dir: sortDirRaw,
    orderBy: `${sortCol} ${sortDir}, s.id ASC`,
  };
}

export async function countStocktakes(db: D1Database, query: Pick<StocktakeListQuery, 'where' | 'binds'>) {
  const row = await db.prepare(`SELECT COUNT(*) as c FROM stocktake s ${query.where}`).bind(...query.binds).first<any>();
  return Number(row?.c || 0);
}

export async function listStocktakes(db: D1Database, query: StocktakeListQuery) {
  const result = await db.prepare(
    `SELECT s.*, w.name AS warehouse_name
     FROM stocktake s
     LEFT JOIN warehouses w ON w.id = s.warehouse_id
     ${query.where}
     ORDER BY ${query.orderBy}
     LIMIT ? OFFSET ?`
  ).bind(...query.binds, query.pageSize, query.offset).all<any>();
  return result.results || [];
}

export async function getStocktakeById(db: D1Database, id: number) {
  return db.prepare(
    `SELECT s.*, w.name AS warehouse_name
     FROM stocktake s LEFT JOIN warehouses w ON w.id=s.warehouse_id
     WHERE s.id=?`
  ).bind(id).first<any>();
}

export async function listStocktakeLines(db: D1Database, id: number) {
  const result = await db.prepare(
    `SELECT l.*, i.sku, i.name, i.category, i.brand, i.model, i.unit
     FROM stocktake_line l
     JOIN items i ON i.id = l.item_id
     WHERE l.stocktake_id=?
     ORDER BY i.sku ASC`
  ).bind(id).all<any>();
  return result.results || [];
}

export function stocktakeAdjustTxNo(stNo: string, itemId: number) {
  return `ADJ${stNo}-${itemId}`;
}

export function stocktakeRollbackTxNo(stNo: string, itemId: number) {
  return `RBK${stNo}-${itemId}`;
}

export async function createStocktake(db: D1Database, stNo: string, warehouseId: number, createdBy: string) {
  await db.batch([
    db.prepare(
      `INSERT INTO stocktake (st_no, warehouse_id, status, created_by, created_at) VALUES (?, ?, 'DRAFT', ?, ${sqlNowStored()})`
    ).bind(stNo, warehouseId, createdBy),
    db.prepare(
      `INSERT INTO stocktake_line (stocktake_id, item_id, system_qty, counted_qty, diff_qty, updated_at)
       SELECT (SELECT id FROM stocktake WHERE st_no=?), i.id,
              COALESCE(s.qty, 0) AS system_qty,
              NULL AS counted_qty,
              NULL AS diff_qty,
              ${sqlNowStored()} AS updated_at
       FROM items i
       LEFT JOIN stock s ON s.item_id = i.id AND s.warehouse_id = ?
       WHERE i.enabled = 1`
    ).bind(stNo, warehouseId),
  ]);
  const row = await db.prepare(`SELECT id FROM stocktake WHERE st_no=?`).bind(stNo).first<any>();
  return Number(row?.id || 0);
}
