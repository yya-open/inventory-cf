import { toSqlRange } from '../_date';
import { buildKeywordWhere, buildNormalizedKeywordWhere } from '../_search';
import { buildFtsKeywordWhere, ensureSearchFtsTables } from './search-fts';

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
    const fts = buildFtsKeywordWhere(filters.keyword, {
      table: 'audit_log_fts',
      rowIdColumn: 'a.id',
    });
    const norm = buildNormalizedKeywordWhere(filters.keyword, {
      column: 'a.search_text_norm',
      numericId: 'a.id',
      exact: ['a.entity_id', 'a.target_code'],
      preferFts: true,
    });
    const parts = [kw.sql, fts.sql, norm.sql].filter(Boolean);
    if (parts.length) {
      wh.push(parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`);
      binds.push(...kw.binds, ...fts.binds, ...norm.binds);
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
  if (filters.module) {
    // 已回填 module_code 的行直接命中 idx_audit_log_module_created_at，只有历史未回填的尾巴才付 CASE 的代价。
    wh.push(`(a.module_code = ? OR (COALESCE(a.module_code, '') = '' AND ${AUDIT_MODULE_FALLBACK_SQL} = ?))`);
    binds.push(filters.module, filters.module);
  }
  // high_risk 是 INTEGER NOT NULL DEFAULT 0，COALESCE 回退永远不会触发，裸列才能命中 idx_audit_log_high_risk_created_at。
  if (filters.highRiskOnly) { wh.push('a.high_risk = 1'); }

  return {
    where: wh.length ? `WHERE ${wh.join(' AND ')}` : '',
    binds,
  };
}

function getAuditOrderBy(filters: AuditListFilters) {
  // created_at 会重复：必须补 a.id 作为决胜列，否则翻页边界会漏行/重复，游标也无法定位。
  if (filters.sortBy === 'created_at') return `a.created_at ${filters.sortDir}, a.id ${filters.sortDir}`;
  return `a.id ${filters.sortDir}`;
}

export type AuditKeysetCursor = { id: number; created_at: string };

/** 与 getAuditOrderBy 的排序键严格对应的 keyset 条件；不用 SQLite 行值语法，保持 D1 兼容。 */
function buildAuditKeysetClause(filters: AuditListFilters, after: AuditKeysetCursor): { sql: string; binds: (string | number)[] } {
  const op = filters.sortDir === 'ASC' ? '>' : '<';
  if (filters.sortBy === 'created_at') {
    return {
      sql: `(a.created_at ${op} ? OR (a.created_at = ? AND a.id ${op} ?))`,
      binds: [after.created_at, after.created_at, after.id],
    };
  }
  return { sql: `a.id ${op} ?`, binds: [after.id] };
}

export async function countAuditRows(db: D1Database, filters: AuditListFilters) {
  if (filters.keyword) await ensureSearchFtsTables(db, ['audit']);
  const { where, binds } = buildAuditWhere(filters);
  const row = await db.prepare(`SELECT COUNT(*) as c FROM audit_log a ${where}`).bind(...binds).first<any>();
  return Number(row?.c || 0);
}

export async function listAuditRows(db: D1Database, filters: AuditListFilters, options?: { limit?: number; offset?: number; after?: AuditKeysetCursor }) {
  if (filters.keyword) await ensureSearchFtsTables(db, ['audit']);
  const { where, binds } = buildAuditWhere(filters);
  const orderBy = getAuditOrderBy(filters);
  const limit = Number(options?.limit ?? filters.pageSize);
  const keyset = options?.after ? buildAuditKeysetClause(filters, options.after) : null;
  const pageWhere = keyset ? (where ? `${where} AND ${keyset.sql}` : `WHERE ${keyset.sql}`) : where;
  const pageTail = keyset ? 'LIMIT ?' : 'LIMIT ? OFFSET ?';
  const pageBinds = keyset
    ? [...binds, ...keyset.binds, limit]
    : [...binds, limit, Number(options?.offset ?? filters.offset)];

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
     ${pageWhere}
     ORDER BY ${orderBy}
     ${pageTail}`
  ).bind(...pageBinds).all<any>();

  return results || [];
}
