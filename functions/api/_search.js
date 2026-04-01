"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeSearchText = normalizeSearchText;
exports.buildKeywordWhere = buildKeywordWhere;
exports.buildNormalizedKeywordWhere = buildNormalizedKeywordWhere;
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
function normalizeSearchText() {
    var parts = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        parts[_i] = arguments[_i];
    }
    return parts
        .flatMap(function (part) { return Array.isArray(part) ? part : [part]; })
        .map(function (part) { return String(part || ''); })
        .join(' ')
        .replace(/[·•|,，;；/\\()\[\]{}]+/g, ' ')
        .replace(/\u3000/g, ' ')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}
function buildLikeClauses(columns, pattern) {
    var clauses = columns.map(function (column) { return "".concat(column, " LIKE ? ESCAPE '\\'"); });
    var binds = columns.map(function () { return pattern; });
    return { clauses: clauses, binds: binds };
}
function buildKeywordWhere(keywordRaw, fields) {
    var keyword = normalizeKeyword(keywordRaw);
    if (!keyword)
        return { sql: '', binds: [], mode: 'none' };
    // 单个纯数字关键词：优先 exact。
    if (isDigits(keyword)) {
        var exactClauses = [];
        var exactBinds = [];
        if (fields.numericId) {
            exactClauses.push("".concat(fields.numericId, " = ?"));
            exactBinds.push(Number(keyword));
        }
        for (var _i = 0, _a = fields.exact || []; _i < _a.length; _i++) {
            var column = _a[_i];
            exactClauses.push("".concat(column, " = ?"));
            exactBinds.push(keyword);
        }
        if (exactClauses.length) {
            return { sql: "(".concat(exactClauses.join(' OR '), ")"), binds: exactBinds, mode: 'exact' };
        }
    }
    var tokens = keyword.split(' ').filter(Boolean);
    var clauseGroups = [];
    var binds = [];
    var hasContains = false;
    for (var _b = 0, tokens_1 = tokens; _b < tokens_1.length; _b++) {
        var token = tokens_1[_b];
        var escaped = escapeLike(token);
        var parts = [];
        var prefix = buildLikeClauses(fields.prefix || [], "".concat(escaped, "%"));
        if (prefix.clauses.length) {
            parts.push.apply(parts, prefix.clauses);
            binds.push.apply(binds, prefix.binds);
        }
        // 短关键词只走 prefix，避免 contains 全表扫。
        if (token.length > 2) {
            var contains = buildLikeClauses(fields.contains || [], "%".concat(escaped, "%"));
            if (contains.clauses.length) {
                hasContains = true;
                parts.push.apply(parts, contains.clauses);
                binds.push.apply(binds, contains.binds);
            }
        }
        // 多词情况下也允许 exact 列参与匹配，如 SN / 资产编号。
        for (var _c = 0, _d = fields.exact || []; _c < _d.length; _c++) {
            var column = _d[_c];
            parts.push("".concat(column, " = ?"));
            binds.push(token);
        }
        if (!parts.length)
            continue;
        clauseGroups.push("(".concat(parts.join(' OR '), ")"));
    }
    if (!clauseGroups.length)
        return { sql: '', binds: [], mode: 'none' };
    return {
        sql: clauseGroups.length === 1 ? clauseGroups[0] : "(".concat(clauseGroups.join(' AND '), ")"),
        binds: binds,
        mode: (hasContains ? 'contains' : 'prefix'),
    };
}
function buildNormalizedKeywordWhere(keywordRaw, options) {
    var keyword = normalizeKeyword(keywordRaw);
    if (!keyword)
        return { sql: '', binds: [], mode: 'none' };
    var normalized = normalizeSearchText(keyword);
    var tokens = normalized.split(' ').filter(Boolean);
    if (!tokens.length)
        return { sql: '', binds: [], mode: 'none' };
    if (tokens.length === 1 && isDigits(tokens[0])) {
        var exactClauses = [];
        var exactBinds = [];
        if (options.numericId) {
            exactClauses.push("".concat(options.numericId, " = ?"));
            exactBinds.push(Number(tokens[0]));
        }
        for (var _i = 0, _a = options.exact || []; _i < _a.length; _i++) {
            var column = _a[_i];
            exactClauses.push("".concat(column, " = ?"));
            exactBinds.push(tokens[0]);
        }
        if (exactClauses.length) {
            return { sql: "(".concat(exactClauses.join(' OR '), ")"), binds: exactBinds, mode: 'exact' };
        }
    }
    if (options.preferFts) {
        var shouldFallback = tokens.some(function (token) { return token.length <= 1 || /[^\x00-\x7F]/.test(token); });
        if (!shouldFallback)
            return { sql: '', binds: [], mode: 'none' };
    }
    var groups = tokens.map(function (token) { return "".concat(options.column, " LIKE ? ESCAPE '\\'"); });
    return {
        sql: groups.length === 1 ? groups[0] : "(".concat(groups.join(' AND '), ")"),
        binds: tokens.map(function (token) { return "%".concat(escapeLike(token), "%"); }),
        mode: 'contains',
    };
}
