import { toSqlRange } from '../_date';
import { buildKeywordWhere, buildNormalizedKeywordWhere } from '../_search';

export type AuditModuleCode = 'STOCK' | 'STOCKTAKE' | 'ITEM' | 'USER' | 'AUDIT' | 'ADMIN' | 'PC' | 'MONITOR' | 'OTHER';

export type AuditListFilters = {
  keyword: string;
  action: string;
  entity: string;
  entityId: string;
  user: string;
  dateFrom: string | null;
  dateTo: string | null;
  module: AuditModuleCode | '';
  highRiskOnly: boolean;
  page: number;
  pageSize: number;
  offset: number;
  sortBy: 'id' | 'created_at';
  sortDir: 'ASC' | 'DESC';
};

const MODULE_CODES: AuditModuleCode[] = ['STOCK', 'STOCKTAKE', 'ITEM', 'USER', 'AUDIT', 'ADMIN', 'PC', 'MONITOR', 'OTHER'];

const AUDIT_MODULE_FALLBACK_SQL = `
CASE
  WHEN UPPER(COALESCE(a.action, '')) LIKE 'STOCKTAKE%' OR LOWER(COALESCE(a.entity, '')) LIKE '%stocktake%' THEN 'STOCKTAKE'
  WHEN UPPER(COALESCE(a.action, '')) LIKE 'STOCK_%' OR LOWER(COALESCE(a.entity, '')) IN ('stock', 'stock_tx') THEN 'STOCK'
  WHEN UPPER(COALESCE(a.action, '')) LIKE 'ITEM_%' OR LOWER(COALESCE(a.entity, '')) = 'items' THEN 'ITEM'
  WHEN UPPER(COALESCE(a.action, '')) LIKE 'USER_%' OR LOWER(COALESCE(a.entity, '')) = 'users' THEN 'USER'
  WHEN UPPER(COALESCE(a.action, '')) LIKE 'AUDIT_%' OR LOWER(COALESCE(a.entity, '')) = 'audit_log' THEN 'AUDIT'
  WHEN UPPER(COALESCE(a.action, '')) LIKE 'ADMIN_%' OR LOWER(COALESCE(a.entity, '')) IN ('restore_job', 'backup', 'schema') THEN 'ADMIN'
  WHEN UPPER(COALESCE(a.action, '')) LIKE 'PC_%' OR LOWER(COALESCE(a.entity, '')) LIKE 'pc_%' THEN 'PC'
  WHEN UPPER(COALESCE(a.action, '')) LIKE 'MONITOR_%' OR LOWER(COALESCE(a.entity, '')) LIKE 'monitor_%' THEN 'MONITOR'
  ELSE 'OTHER'
END`;

const AUDIT_HIGH_RISK_FALLBACK_SQL = `
CASE
  WHEN INSTR(UPPER(COALESCE(a.action, '')), 'DELETE') > 0
    OR INSTR(UPPER(COALESCE(a.action, '')), 'ARCHIVE') > 0
    OR INSTR(UPPER(COALESCE(a.action, '')), 'SCRAP') > 0
    OR INSTR(UPPER(COALESCE(a.action, '')), 'ROLLBACK') > 0
    OR INSTR(UPPER(COALESCE(a.action, '')), 'RESET_PASSWORD') > 0
    OR INSTR(UPPER(COALESCE(a.action, '')), 'RESTORE') > 0
    OR INSTR(UPPER(COALESCE(a.action, '')), 'CLEAR') > 0
  THEN 1 ELSE 0
END`;

export const AUDIT_MODULE_SQL = `COALESCE(NULLIF(a.module_code, ''), ${AUDIT_MODULE_FALLBACK_SQL})`;
export const AUDIT_HIGH_RISK_SQL = `COALESCE(a.high_risk, ${AUDIT_HIGH_RISK_FALLBACK_SQL})`;

function toBool(value: string | null) {
  if (value == null) return false;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

export function parseAuditListFilters(url: URL): AuditListFilters {
  const moduleRaw = String(url.searchParams.get('module') || '').trim().toUpperCase();
  const sortByRaw = (url.searchParams.get('sort_by') || 'id').trim();
  const sortDirRaw = (url.searchParams.get('sort_dir') || 'desc').trim().toLowerCase();
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(200, Math.max(20, Number(url.searchParams.get('page_size') || 50)));
  return {
    keyword: (url.searchParams.get('keyword') || '').trim(),
    action: (url.searchParams.get('action') || '').trim(),
    entity: (url.searchParams.get('entity') || '').trim(),
    entityId: (url.searchParams.get('entity_id') || '').trim(),
    user: (url.searchParams.get('user') || '').trim(),
    dateFrom: url.searchParams.get('date_from'),
    dateTo: url.searchParams.get('date_to'),
    module: (MODULE_CODES.includes(moduleRaw as AuditModuleCode) ? moduleRaw : '') as AuditModuleCode | '',
    highRiskOnly: toBool(url.searchParams.get('high_risk')),
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    sortBy: sortByRaw === 'created_at' ? 'created_at' : 'id',
    sortDir: sortDirRaw === 'asc' ? 'ASC' : 'DESC',
  } as AuditListFilters;
}

export function buildAuditWhere(filters: AuditListFilters) {
  const wh: string[] = [];
  const binds: any[] = [];

  if (filters.keyword) {
    const kw = buildKeywordWhere(filters.keyword, {
      numericId: 'a.id',
      exact: ['a.entity_id', 'a.target_code'],
      prefix: ['a.username', 'a.action', 'a.entity', 'a.entity_id', 'a.target_name', 'a.target_code'],
      contains: [],
    });
    const norm = buildNormalizedKeywordWhere(filters.keyword, {
      column: 'a.search_text_norm',
      numericId: 'a.id',
      exact: ['a.entity_id', 'a.target_code'],
    });
    const parts = [kw.sql, norm.sql].filter(Boolean);
    if (parts.length) {
      wh.push(parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`);
      binds.push(...kw.binds, ...norm.binds);
    }
  }
  if (filters.action) { wh.push('a.action=?'); binds.push(filters.action); }
  if (filters.entity) { wh.push('a.entity=?'); binds.push(filters.entity); }
  if (filters.entityId) { wh.push('a.entity_id=?'); binds.push(filters.entityId); }
  if (filters.user) { wh.push('a.username=?'); binds.push(filters.user); }
  const fromSql = toSqlRange(filters.dateFrom, false);
  const toSql = toSqlRange(filters.dateTo, true);
  if (fromSql) { wh.push('a.created_at >= ?'); binds.push(fromSql); }
  if (toSql) { wh.push('a.created_at <= ?'); binds.push(toSql); }
  if (filters.module) { wh.push(`${AUDIT_MODULE_SQL} = ?`); binds.push(filters.module); }
  if (filters.highRiskOnly) { wh.push(`${AUDIT_HIGH_RISK_SQL} = 1`); }

  return {
    where: wh.length ? `WHERE ${wh.join(' AND ')}` : '',
    binds,
  };
}

function getAuditOrderBy(filters: AuditListFilters) {
  const sortCol = filters.sortBy === 'created_at' ? 'a.created_at' : 'a.id';
  return `${sortCol} ${filters.sortDir}`;
}

export async function countAuditRows(db: D1Database, filters: AuditListFilters) {
  const { where, binds } = buildAuditWhere(filters);
  const row = await db.prepare(`SELECT COUNT(*) as c FROM audit_log a ${where}`).bind(...binds).first<any>();
  return Number(row?.c || 0);
}

export async function listAuditRows(db: D1Database, filters: AuditListFilters, options?: { limit?: number; offset?: number }) {
  const { where, binds } = buildAuditWhere(filters);
  const orderBy = getAuditOrderBy(filters);
  const limit = Number(options?.limit ?? filters.pageSize);
  const offset = Number(options?.offset ?? filters.offset);

  const { results } = await db.prepare(
    `SELECT a.id, a.created_at, a.username, a.action, a.entity, a.entity_id, a.ip, a.ua, a.payload_json,
            ${AUDIT_MODULE_SQL} AS module_code,
            ${AUDIT_HIGH_RISK_SQL} AS high_risk,
            a.target_name,
            a.target_code,
            a.summary_text,
            COALESCE(a.target_name, itx.name, iitems.name, json_extract(a.payload_json,'$.after.name'), json_extract(a.payload_json,'$.name')) AS item_name,
            COALESCE(
              CASE WHEN a.entity = 'users' THEN
                COALESCE(
                  a.target_name,
                  json_extract(a.payload_json,'$.after.username'),
                  json_extract(a.payload_json,'$.before.username'),
                  json_extract(a.payload_json,'$.username'),
                  u.username
                )
              END,
              NULL
            ) AS user_name
     FROM audit_log a
     LEFT JOIN stock_tx st
       ON a.entity = 'stock_tx' AND st.tx_no = a.entity_id
     LEFT JOIN items itx
       ON itx.id = st.item_id
     LEFT JOIN items iitems
       ON a.entity = 'items' AND iitems.id = CAST(a.entity_id AS INTEGER)
     LEFT JOIN users u
       ON a.entity = 'users' AND u.id = CAST(a.entity_id AS INTEGER)
     ${where}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`
  ).bind(...binds, limit, offset).all<any>();

  return results || [];
}
