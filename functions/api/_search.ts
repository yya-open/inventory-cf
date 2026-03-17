export type KeywordMode = 'none' | 'exact' | 'prefix' | 'contains';

function isDigits(s: string) {
  return /^\d+$/.test(s);
}

function normalizeKeyword(input: string) {
  return String(input || '')
    .replace(/\u3000/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function escapeLike(input: string) {
  return String(input || '').replace(/[\\%_]/g, '\\$&');
}

export type KeywordFields = {
  /** exact match fields, e.g. ["i.sku", "CAST(i.id AS TEXT)"] */
  exact?: string[];
  /** prefix match fields, e.g. ["i.sku", "i.name"] */
  prefix?: string[];
  /** contains match fields, e.g. ["i.name", "i.brand"] */
  contains?: string[];
  /** numeric id field (INTEGER) for digits-only keyword, e.g. "i.id" */
  numericId?: string;
};

function buildLikeClauses(columns: string[], pattern: string) {
  const clauses = columns.map((column) => `${column} LIKE ? ESCAPE '\\'`);
  const binds = columns.map(() => pattern);
  return { clauses, binds };
}

export function buildKeywordWhere(keywordRaw: string, fields: KeywordFields) {
  const keyword = normalizeKeyword(keywordRaw);
  if (!keyword) return { sql: '', binds: [] as any[], mode: 'none' as KeywordMode };

  // 单个纯数字关键词：优先 exact。
  if (isDigits(keyword)) {
    const exactClauses: string[] = [];
    const exactBinds: any[] = [];
    if (fields.numericId) {
      exactClauses.push(`${fields.numericId} = ?`);
      exactBinds.push(Number(keyword));
    }
    for (const column of fields.exact || []) {
      exactClauses.push(`${column} = ?`);
      exactBinds.push(keyword);
    }
    if (exactClauses.length) {
      return { sql: `(${exactClauses.join(' OR ')})`, binds: exactBinds, mode: 'exact' as KeywordMode };
    }
  }

  const tokens = keyword.split(' ').filter(Boolean);
  const clauseGroups: string[] = [];
  const binds: any[] = [];
  let hasContains = false;

  for (const token of tokens) {
    const escaped = escapeLike(token);
    const parts: string[] = [];

    const prefix = buildLikeClauses(fields.prefix || [], `${escaped}%`);
    if (prefix.clauses.length) {
      parts.push(...prefix.clauses);
      binds.push(...prefix.binds);
    }

    // 短关键词只走 prefix，避免 contains 全表扫。
    if (token.length > 2) {
      const contains = buildLikeClauses(fields.contains || [], `%${escaped}%`);
      if (contains.clauses.length) {
        hasContains = true;
        parts.push(...contains.clauses);
        binds.push(...contains.binds);
      }
    }

    // 多词情况下也允许 exact 列参与匹配，如 SN / 资产编号。
    for (const column of fields.exact || []) {
      parts.push(`${column} = ?`);
      binds.push(token);
    }

    if (!parts.length) continue;
    clauseGroups.push(`(${parts.join(' OR ')})`);
  }

  if (!clauseGroups.length) return { sql: '', binds: [], mode: 'none' as KeywordMode };
  return {
    sql: clauseGroups.length === 1 ? clauseGroups[0] : `(${clauseGroups.join(' AND ')})`,
    binds,
    mode: (hasContains ? 'contains' : 'prefix') as KeywordMode,
  };
}
