function isDigits(s) {
    return /^\d+$/.test(s);
}
function normalizeKeyword(input) {
    return String(input || '')
        .replace(/\u3000/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}
function escapeLike(input) {
    return String(input || '').replace(/[\\%_]/g, '\\$&');
}
export function normalizeSearchText(...parts) {
    return parts
        .flatMap((part) => Array.isArray(part) ? part : [part])
        .map((part) => String(part || ''))
        .join(' ')
        .replace(/[·•|,，;；/\\()\[\]{}]+/g, ' ')
        .replace(/\u3000/g, ' ')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}
function buildLikeClauses(columns, pattern) {
    const clauses = columns.map((column) => `${column} LIKE ? ESCAPE '\\'`);
    const binds = columns.map(() => pattern);
    return { clauses, binds };
}
export function buildKeywordWhere(keywordRaw, fields) {
    const keyword = normalizeKeyword(keywordRaw);
    if (!keyword)
        return { sql: '', binds: [], mode: 'none' };
    // 单个纯数字关键词：优先 exact。
    if (isDigits(keyword)) {
        const exactClauses = [];
        const exactBinds = [];
        if (fields.numericId) {
            exactClauses.push(`${fields.numericId} = ?`);
            exactBinds.push(Number(keyword));
        }
        for (const column of fields.exact || []) {
            exactClauses.push(`${column} = ?`);
            exactBinds.push(keyword);
        }
        if (exactClauses.length) {
            return { sql: `(${exactClauses.join(' OR ')})`, binds: exactBinds, mode: 'exact' };
        }
    }
    const tokens = keyword.split(' ').filter(Boolean);
    const clauseGroups = [];
    const binds = [];
    let hasContains = false;
    for (const token of tokens) {
        const escaped = escapeLike(token);
        const parts = [];
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
        if (!parts.length)
            continue;
        clauseGroups.push(`(${parts.join(' OR ')})`);
    }
    if (!clauseGroups.length)
        return { sql: '', binds: [], mode: 'none' };
    return {
        sql: clauseGroups.length === 1 ? clauseGroups[0] : `(${clauseGroups.join(' AND ')})`,
        binds,
        mode: (hasContains ? 'contains' : 'prefix'),
    };
}
export function buildNormalizedKeywordWhere(keywordRaw, options) {
    const keyword = normalizeKeyword(keywordRaw);
    if (!keyword)
        return { sql: '', binds: [], mode: 'none' };
    const normalized = normalizeSearchText(keyword);
    const tokens = normalized.split(' ').filter(Boolean);
    if (!tokens.length)
        return { sql: '', binds: [], mode: 'none' };
    if (tokens.length === 1 && isDigits(tokens[0])) {
        const exactClauses = [];
        const exactBinds = [];
        if (options.numericId) {
            exactClauses.push(`${options.numericId} = ?`);
            exactBinds.push(Number(tokens[0]));
        }
        for (const column of options.exact || []) {
            exactClauses.push(`${column} = ?`);
            exactBinds.push(tokens[0]);
        }
        if (exactClauses.length) {
            return { sql: `(${exactClauses.join(' OR ')})`, binds: exactBinds, mode: 'exact' };
        }
    }
    const groups = tokens.map((token) => `${options.column} LIKE ? ESCAPE '\\'`);
    return {
        sql: groups.length === 1 ? groups[0] : `(${groups.join(' AND ')})`,
        binds: tokens.map((token) => `%${escapeLike(token)}%`),
        mode: 'contains',
    };
}
