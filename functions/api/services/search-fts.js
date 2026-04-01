"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureSearchFtsTables = ensureSearchFtsTables;
exports.rebuildSearchFtsTables = rebuildSearchFtsTables;
exports.buildFtsKeywordWhere = buildFtsKeywordWhere;
var _search_1 = require("../_search");
var ensuredKeys = new Set();
var ensurePromises = new Map();
var CREATE_SQL = {
    pc: [
        "CREATE VIRTUAL TABLE IF NOT EXISTS pc_assets_fts USING fts5(\n      serial_no,\n      brand,\n      model,\n      remark,\n      disk_capacity,\n      memory_size,\n      search_text_norm,\n      tokenize='unicode61 remove_diacritics 2',\n      prefix='2 3 4 5 6'\n    )",
        "CREATE TRIGGER IF NOT EXISTS pc_assets_fts_ai AFTER INSERT ON pc_assets BEGIN\n      INSERT INTO pc_assets_fts(rowid, serial_no, brand, model, remark, disk_capacity, memory_size, search_text_norm)\n      VALUES (new.id, COALESCE(new.serial_no,''), COALESCE(new.brand,''), COALESCE(new.model,''), COALESCE(new.remark,''), COALESCE(new.disk_capacity,''), COALESCE(new.memory_size,''), COALESCE(new.search_text_norm,''));\n    END",
        "CREATE TRIGGER IF NOT EXISTS pc_assets_fts_au AFTER UPDATE ON pc_assets BEGIN\n      DELETE FROM pc_assets_fts WHERE rowid = old.id;\n      INSERT INTO pc_assets_fts(rowid, serial_no, brand, model, remark, disk_capacity, memory_size, search_text_norm)\n      VALUES (new.id, COALESCE(new.serial_no,''), COALESCE(new.brand,''), COALESCE(new.model,''), COALESCE(new.remark,''), COALESCE(new.disk_capacity,''), COALESCE(new.memory_size,''), COALESCE(new.search_text_norm,''));\n    END",
        "CREATE TRIGGER IF NOT EXISTS pc_assets_fts_ad AFTER DELETE ON pc_assets BEGIN\n      DELETE FROM pc_assets_fts WHERE rowid = old.id;\n    END",
    ],
    monitor: [
        "CREATE VIRTUAL TABLE IF NOT EXISTS monitor_assets_fts USING fts5(\n      asset_code,\n      sn,\n      brand,\n      model,\n      size_inch,\n      employee_no,\n      employee_name,\n      department,\n      remark,\n      search_text_norm,\n      tokenize='unicode61 remove_diacritics 2',\n      prefix='2 3 4 5 6'\n    )",
        "CREATE TRIGGER IF NOT EXISTS monitor_assets_fts_ai AFTER INSERT ON monitor_assets BEGIN\n      INSERT INTO monitor_assets_fts(rowid, asset_code, sn, brand, model, size_inch, employee_no, employee_name, department, remark, search_text_norm)\n      VALUES (new.id, COALESCE(new.asset_code,''), COALESCE(new.sn,''), COALESCE(new.brand,''), COALESCE(new.model,''), COALESCE(new.size_inch,''), COALESCE(new.employee_no,''), COALESCE(new.employee_name,''), COALESCE(new.department,''), COALESCE(new.remark,''), COALESCE(new.search_text_norm,''));\n    END",
        "CREATE TRIGGER IF NOT EXISTS monitor_assets_fts_au AFTER UPDATE ON monitor_assets BEGIN\n      DELETE FROM monitor_assets_fts WHERE rowid = old.id;\n      INSERT INTO monitor_assets_fts(rowid, asset_code, sn, brand, model, size_inch, employee_no, employee_name, department, remark, search_text_norm)\n      VALUES (new.id, COALESCE(new.asset_code,''), COALESCE(new.sn,''), COALESCE(new.brand,''), COALESCE(new.model,''), COALESCE(new.size_inch,''), COALESCE(new.employee_no,''), COALESCE(new.employee_name,''), COALESCE(new.department,''), COALESCE(new.remark,''), COALESCE(new.search_text_norm,''));\n    END",
        "CREATE TRIGGER IF NOT EXISTS monitor_assets_fts_ad AFTER DELETE ON monitor_assets BEGIN\n      DELETE FROM monitor_assets_fts WHERE rowid = old.id;\n    END",
    ],
    audit: [
        "CREATE VIRTUAL TABLE IF NOT EXISTS audit_log_fts USING fts5(\n      username,\n      action,\n      entity,\n      entity_id,\n      target_name,\n      target_code,\n      summary_text,\n      search_text_norm,\n      tokenize='unicode61 remove_diacritics 2',\n      prefix='2 3 4 5 6'\n    )",
        "CREATE TRIGGER IF NOT EXISTS audit_log_fts_ai AFTER INSERT ON audit_log BEGIN\n      INSERT INTO audit_log_fts(rowid, username, action, entity, entity_id, target_name, target_code, summary_text, search_text_norm)\n      VALUES (new.id, COALESCE(new.username,''), COALESCE(new.action,''), COALESCE(new.entity,''), COALESCE(new.entity_id,''), COALESCE(new.target_name,''), COALESCE(new.target_code,''), COALESCE(new.summary_text,''), COALESCE(new.search_text_norm,''));\n    END",
        "CREATE TRIGGER IF NOT EXISTS audit_log_fts_au AFTER UPDATE ON audit_log BEGIN\n      DELETE FROM audit_log_fts WHERE rowid = old.id;\n      INSERT INTO audit_log_fts(rowid, username, action, entity, entity_id, target_name, target_code, summary_text, search_text_norm)\n      VALUES (new.id, COALESCE(new.username,''), COALESCE(new.action,''), COALESCE(new.entity,''), COALESCE(new.entity_id,''), COALESCE(new.target_name,''), COALESCE(new.target_code,''), COALESCE(new.summary_text,''), COALESCE(new.search_text_norm,''));\n    END",
        "CREATE TRIGGER IF NOT EXISTS audit_log_fts_ad AFTER DELETE ON audit_log BEGIN\n      DELETE FROM audit_log_fts WHERE rowid = old.id;\n    END",
    ],
};
function runSqlList(db, sqlList) {
    return __awaiter(this, void 0, void 0, function () {
        var _i, sqlList_1, sql;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _i = 0, sqlList_1 = sqlList;
                    _a.label = 1;
                case 1:
                    if (!(_i < sqlList_1.length)) return [3 /*break*/, 4];
                    sql = sqlList_1[_i];
                    return [4 /*yield*/, db.prepare(sql).run()];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function refillFtsTable(db, key) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(key === 'pc')) return [3 /*break*/, 3];
                    return [4 /*yield*/, db.prepare("DELETE FROM pc_assets_fts").run().catch(function () { })];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, db.prepare("INSERT INTO pc_assets_fts(rowid, serial_no, brand, model, remark, disk_capacity, memory_size, search_text_norm)\n       SELECT id, COALESCE(serial_no,''), COALESCE(brand,''), COALESCE(model,''), COALESCE(remark,''), COALESCE(disk_capacity,''), COALESCE(memory_size,''), COALESCE(search_text_norm,'')\n       FROM pc_assets").run()];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
                case 3:
                    if (!(key === 'monitor')) return [3 /*break*/, 6];
                    return [4 /*yield*/, db.prepare("DELETE FROM monitor_assets_fts").run().catch(function () { })];
                case 4:
                    _a.sent();
                    return [4 /*yield*/, db.prepare("INSERT INTO monitor_assets_fts(rowid, asset_code, sn, brand, model, size_inch, employee_no, employee_name, department, remark, search_text_norm)\n       SELECT id, COALESCE(asset_code,''), COALESCE(sn,''), COALESCE(brand,''), COALESCE(model,''), COALESCE(size_inch,''), COALESCE(employee_no,''), COALESCE(employee_name,''), COALESCE(department,''), COALESCE(remark,''), COALESCE(search_text_norm,'')\n       FROM monitor_assets").run()];
                case 5:
                    _a.sent();
                    return [2 /*return*/];
                case 6: return [4 /*yield*/, db.prepare("DELETE FROM audit_log_fts").run().catch(function () { })];
                case 7:
                    _a.sent();
                    return [4 /*yield*/, db.prepare("INSERT INTO audit_log_fts(rowid, username, action, entity, entity_id, target_name, target_code, summary_text, search_text_norm)\n     SELECT id, COALESCE(username,''), COALESCE(action,''), COALESCE(entity,''), COALESCE(entity_id,''), COALESCE(target_name,''), COALESCE(target_code,''), COALESCE(summary_text,''), COALESCE(search_text_norm,'')\n     FROM audit_log").run()];
                case 8:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function maybeBootstrapFtsTable(db, key, table, sourceTable) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, ftsRow, sourceRow;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, Promise.all([
                        db.prepare("SELECT COUNT(*) AS c FROM ".concat(table)).first().catch(function () { return ({ c: 0 }); }),
                        db.prepare("SELECT COUNT(*) AS c FROM ".concat(sourceTable)).first().catch(function () { return ({ c: 0 }); }),
                    ])];
                case 1:
                    _a = _b.sent(), ftsRow = _a[0], sourceRow = _a[1];
                    if (!(Number((sourceRow === null || sourceRow === void 0 ? void 0 : sourceRow.c) || 0) > 0 && Number((ftsRow === null || ftsRow === void 0 ? void 0 : ftsRow.c) || 0) === 0)) return [3 /*break*/, 3];
                    return [4 /*yield*/, refillFtsTable(db, key)];
                case 2:
                    _b.sent();
                    _b.label = 3;
                case 3: return [2 /*return*/];
            }
        });
    });
}
function ensureSearchFtsTables(db_1) {
    return __awaiter(this, arguments, void 0, function (db, keys) {
        var wanted;
        var _this = this;
        if (keys === void 0) { keys = ['pc', 'monitor', 'audit']; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    wanted = Array.from(new Set(Array.isArray(keys) ? keys : ['pc', 'monitor', 'audit'])).filter(Boolean);
                    if (!wanted.length)
                        return [2 /*return*/];
                    return [4 /*yield*/, Promise.all(wanted.map(function (key) { return __awaiter(_this, void 0, void 0, function () {
                            var existing, pending;
                            var _this = this;
                            return __generator(this, function (_a) {
                                if (ensuredKeys.has(key))
                                    return [2 /*return*/];
                                existing = ensurePromises.get(key);
                                if (existing)
                                    return [2 /*return*/, existing];
                                pending = (function () { return __awaiter(_this, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, runSqlList(db, CREATE_SQL[key])];
                                            case 1:
                                                _a.sent();
                                                if (!(key === 'pc')) return [3 /*break*/, 3];
                                                return [4 /*yield*/, maybeBootstrapFtsTable(db, 'pc', 'pc_assets_fts', 'pc_assets')];
                                            case 2:
                                                _a.sent();
                                                return [3 /*break*/, 7];
                                            case 3:
                                                if (!(key === 'monitor')) return [3 /*break*/, 5];
                                                return [4 /*yield*/, maybeBootstrapFtsTable(db, 'monitor', 'monitor_assets_fts', 'monitor_assets')];
                                            case 4:
                                                _a.sent();
                                                return [3 /*break*/, 7];
                                            case 5: return [4 /*yield*/, maybeBootstrapFtsTable(db, 'audit', 'audit_log_fts', 'audit_log')];
                                            case 6:
                                                _a.sent();
                                                _a.label = 7;
                                            case 7:
                                                ensuredKeys.add(key);
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })().finally(function () {
                                    ensurePromises.delete(key);
                                });
                                ensurePromises.set(key, pending);
                                return [2 /*return*/, pending];
                            });
                        }); }))];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function rebuildSearchFtsTables(db_1) {
    return __awaiter(this, arguments, void 0, function (db, keys) {
        var wanted, _i, wanted_1, key;
        if (keys === void 0) { keys = ['pc', 'monitor', 'audit']; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureSearchFtsTables(db, keys)];
                case 1:
                    _a.sent();
                    wanted = Array.from(new Set(keys));
                    _i = 0, wanted_1 = wanted;
                    _a.label = 2;
                case 2:
                    if (!(_i < wanted_1.length)) return [3 /*break*/, 5];
                    key = wanted_1[_i];
                    return [4 /*yield*/, refillFtsTable(db, key)];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function quoteFtsToken(token) {
    return "\"".concat(token.replace(/"/g, '""'), "\"");
}
function normalizeFtsTokens(keywordRaw) {
    var normalized = (0, _search_1.normalizeSearchText)(keywordRaw);
    return normalized.split(' ').map(function (token) { return token.trim(); }).filter(Boolean).slice(0, 8);
}
function buildFtsKeywordWhere(keywordRaw, options) {
    var tokens = normalizeFtsTokens(keywordRaw);
    if (!tokens.length)
        return { sql: '', binds: [] };
    var query = tokens
        .map(function (token) { return token.length >= 2 ? "".concat(quoteFtsToken(token), "*") : quoteFtsToken(token); })
        .join(' AND ');
    return {
        sql: "".concat(options.rowIdColumn, " IN (SELECT rowid FROM ").concat(options.table, " WHERE ").concat(options.table, " MATCH ?)"),
        binds: [query],
    };
}
