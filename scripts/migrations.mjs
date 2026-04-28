import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), '..');
const manifestPath = path.join(root, 'sql', 'migrations.manifest.json');
const registrySql = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at);
`;

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function sqlEscape(text) { return String(text).replace(/'/g, "''"); }
function defaultWranglerBin() {
  return 'wrangler';
}
function parseArgs(argv) {
  const out = { action: 'plan', db: '', remote: false, local: false, wrangler: process.env.WRANGLER_BIN || defaultWranglerBin() };
  const args = [...argv];
  if (args[0] && !args[0].startsWith('--')) out.action = args.shift();
  while (args.length) {
    const cur = args.shift();
    if (cur === '--db') out.db = String(args.shift() || '');
    else if (cur === '--remote') out.remote = true;
    else if (cur === '--local') out.local = true;
    else if (cur === '--wrangler') out.wrangler = String(args.shift() || out.wrangler);
  }
  return out;
}
function verifyManifest() {
  const ids = new Set(); let prev = '';
  for (const entry of manifest) {
    if (!entry.id || !entry.file) throw new Error(`Invalid manifest entry: ${JSON.stringify(entry)}`);
    if (ids.has(entry.id)) throw new Error(`Duplicate migration id: ${entry.id}`);
    if (prev && entry.id < prev) throw new Error(`Manifest out of order: ${entry.id} < ${prev}`);
    const abs = path.join(root, entry.file);
    if (!fs.existsSync(abs)) throw new Error(`Missing migration file: ${entry.file}`);
    ids.add(entry.id); prev = entry.id;
  }
}
function runWrangler({ wrangler, db, command, file, remote, local, json = false }) {
  const args = ['d1', 'execute', db];
  let tempCommandFile = null;
  if (remote) args.push('--remote');
  if (local) args.push('--local');
  if (json) args.push('--json');
  if (command && file) throw new Error('runWrangler received both command and file; choose one');
  if (command) {
    const commandText = String(command);
    const useCommandFile = process.platform === 'win32' && /\r|\n/.test(commandText);
    if (useCommandFile) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-migration-command-'));
      tempCommandFile = path.join(dir, 'command.sql');
      fs.writeFileSync(tempCommandFile, commandText);
      args.push('--file', tempCommandFile);
    } else {
      args.push('--command', commandText);
    }
  }
  if (file) args.push('--file', file);

  let result;
  if (process.platform === 'win32') {
    const quoteArg = (value) => {
      const s = String(value ?? '');
      return `"${s.replace(/"/g, '""')}"`;
    };
    const cmdline = [wrangler, ...args].map(quoteArg).join(' ');
    result = spawnSync(cmdline, { cwd: root, encoding: 'utf8', shell: true });
  } else {
    result = spawnSync(wrangler, args, { cwd: root, encoding: 'utf8' });
  }

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `wrangler exited with ${result.status}`);
  return result.stdout.trim();
}

function runWranglerRaw({ wrangler, argv }) {
  let result;
  if (process.platform === 'win32') {
    const quoteArg = (value) => {
      const s = String(value ?? '');
      return `"${s.replace(/"/g, '""')}"`;
    };
    const cmdline = [wrangler, ...argv].map(quoteArg).join(' ');
    result = spawnSync(cmdline, { cwd: root, encoding: 'utf8', shell: true });
  } else {
    result = spawnSync(wrangler, argv, { cwd: root, encoding: 'utf8' });
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `wrangler exited with ${result.status}`);
  return result.stdout.trim();
}

function parseWranglerJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {}

  let parsed = null;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '[' && ch !== '{') continue;
    const candidate = raw.slice(i).trim();
    try {
      parsed = JSON.parse(candidate);
    } catch {}
  }
  if (parsed != null) return parsed;
  throw new Error(`Unable to parse wrangler JSON output:\n${raw.slice(0, 500)}`);
}

function extractResultsRows(payload) {
  const queue = [payload];
  while (queue.length) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      if (current.length && current.every((row) => row && typeof row === 'object' && !Array.isArray(row) && !('results' in row))) {
        return current;
      }
      for (const item of current) queue.push(item);
      continue;
    }
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current.results)) return current.results;
    for (const value of Object.values(current)) queue.push(value);
  }
  return [];
}

function ensureRegistry(args) { runWrangler({ ...args, command: registrySql }); }
function listApplied(args) {
  const out = runWrangler({ ...args, json: true, command: 'SELECT id, name, checksum, applied_at FROM schema_migrations ORDER BY id' });
  const parsed = parseWranglerJson(out || '[]');
  return extractResultsRows(parsed);
}
function listTableColumns(args, tableName) {
  const out = runWrangler({ ...args, json: true, command: `PRAGMA table_info(${tableName})` });
  const parsed = parseWranglerJson(out || '[]');
  const cols = extractResultsRows(parsed);
  return new Set(cols.map((row) => String(row?.name || '').trim()).filter(Boolean));
}
function hasAllColumns(args, tableName, columns) {
  const names = listTableColumns(args, tableName);
  return columns.every((name) => names.has(name));
}
function addColumnIfMissing(args, tableName, columnName, definitionSql) {
  const names = listTableColumns(args, tableName);
  if (names.has(columnName)) return false;
  runWrangler({ ...args, command: `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}` });
  return true;
}
function repairAssetArchiveColumns(args) {
  let changed = false;
  changed = addColumnIfMissing(args, 'pc_assets', 'archived', 'INTEGER NOT NULL DEFAULT 0') || changed;
  changed = addColumnIfMissing(args, 'pc_assets', 'archived_at', 'TEXT') || changed;
  changed = addColumnIfMissing(args, 'monitor_assets', 'archived', 'INTEGER NOT NULL DEFAULT 0') || changed;
  changed = addColumnIfMissing(args, 'monitor_assets', 'archived_at', 'TEXT') || changed;

  changed = addColumnIfMissing(args, 'pc_assets', 'archived_reason', 'TEXT') || changed;
  changed = addColumnIfMissing(args, 'pc_assets', 'archived_note', 'TEXT') || changed;
  changed = addColumnIfMissing(args, 'pc_assets', 'archived_by', 'TEXT') || changed;
  changed = addColumnIfMissing(args, 'monitor_assets', 'archived_reason', 'TEXT') || changed;
  changed = addColumnIfMissing(args, 'monitor_assets', 'archived_note', 'TEXT') || changed;
  changed = addColumnIfMissing(args, 'monitor_assets', 'archived_by', 'TEXT') || changed;
  return changed;
}
function applyAssetFkCascadeFallback(args) {
  const sql = `
CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_reason_id ON pc_assets(archived, archived_reason, id);
CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_reason_id ON monitor_assets(archived, archived_reason, id);

CREATE TABLE IF NOT EXISTS pc_inventory_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  issue_type TEXT,
  remark TEXT,
  ip TEXT,
  ua TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  FOREIGN KEY(asset_id) REFERENCES pc_assets(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS pc_recycle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recycle_no TEXT NOT NULL UNIQUE,
  action TEXT NOT NULL CHECK(action IN ('RETURN','RECYCLE')),
  asset_id INTEGER NOT NULL,
  employee_no TEXT,
  department TEXT,
  employee_name TEXT,
  is_employed TEXT,
  brand TEXT NOT NULL,
  serial_no TEXT NOT NULL,
  model TEXT NOT NULL,
  recycle_date TEXT NOT NULL,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  created_by TEXT,
  FOREIGN KEY(asset_id) REFERENCES pc_assets(id)
);
CREATE TABLE IF NOT EXISTS monitor_inventory_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('OK','ISSUE')),
  issue_type TEXT,
  remark TEXT,
  ip TEXT,
  ua TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  FOREIGN KEY(asset_id) REFERENCES monitor_assets(id)
);
`;
  runWrangler({ ...args, command: sql });
}
function migrationSatisfied(args, entry) {
  if (!entry?.id) return false;
  if (entry.id === '202603170010_auth_token_version') {
    return hasAllColumns(args, 'users', ['token_version']);
  }
  if (entry.id === '202603180010_asset_archive') {
    return hasAllColumns(args, 'pc_assets', ['archived', 'archived_at'])
      && hasAllColumns(args, 'monitor_assets', ['archived', 'archived_at']);
  }
  if (entry.id === '202603180020_asset_archive_meta') {
    return hasAllColumns(args, 'pc_assets', ['archived_reason', 'archived_note', 'archived_by'])
      && hasAllColumns(args, 'monitor_assets', ['archived_reason', 'archived_note', 'archived_by']);
  }
  if (entry.id === '202604270010_users_acl_version') {
    return hasAllColumns(args, 'users', ['acl_version']);
  }
  if (entry.id === '202603210010_user_data_scope_and_drill_closure') {
    return hasAllColumns(args, 'users', ['data_scope_type', 'data_scope_value'])
      && hasAllColumns(args, 'backup_drill_runs', [
        'issue_count',
        'follow_up_status',
        'rect_owner',
        'rect_due_at',
        'rect_closed_at',
        'review_note',
        'updated_at',
      ]);
  }
  return false;
}
function migrationSql(entry) {
  return fs.readFileSync(path.join(root, entry.file), 'utf8').trim();
}

function splitSqlStatements(sqlText) {
  return String(sqlText || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeSqlIdent(name) {
  return String(name || '').trim().replace(/^['"`\[]+|['"`\]]+$/g, '');
}

function renderWrappedSqlWithAlterGuards(args, entry) {
  const rawSql = migrationSql(entry);
  const executableSql = stripForbiddenTransactionSql(rawSql);
  const statements = splitSqlStatements(executableSql);
  const tableColumns = new Map();
  const guarded = [];

  for (const statement of statements) {
    const m = statement.match(/^ALTER\s+TABLE\s+([^\s]+)\s+ADD\s+COLUMN\s+([^\s]+)\s+/i);
    if (!m) {
      guarded.push(statement);
      continue;
    }
    const tableName = normalizeSqlIdent(m[1]);
    const columnName = normalizeSqlIdent(m[2]);
    if (!tableColumns.has(tableName)) tableColumns.set(tableName, listTableColumns(args, tableName));
    const cols = tableColumns.get(tableName);
    if (cols.has(columnName)) continue;
    cols.add(columnName);
    guarded.push(statement);
  }

  return `-- ${entry.id} ${entry.description || ''}\n${guarded.join(';\n')}${guarded.length ? ';\n' : ''}INSERT OR REPLACE INTO schema_migrations (id, name, checksum, applied_at) VALUES ('${sqlEscape(entry.id)}', '${sqlEscape(entry.file)}', '${migrationChecksum(entry)}', datetime('now','+8 hours'));\n`;
}
function stripForbiddenTransactionSql(sqlText) {
  const lines = String(sqlText || '').split(/\r?\n/);
  const blocked = /^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i;
  return lines.filter((line) => {
    const cleaned = line.replace(/--.*$/, '').trim().replace(/;\s*$/, '');
    if (!cleaned) return true;
    return !blocked.test(cleaned);
  }).join('\n').trim();
}
function migrationChecksum(entry) {
  return sha256(migrationSql(entry));
}
function markApplied(args, entry) {
  const command = `INSERT OR REPLACE INTO schema_migrations (id, name, checksum, applied_at) VALUES ('${sqlEscape(entry.id)}', '${sqlEscape(entry.file)}', '${migrationChecksum(entry)}', datetime('now','+8 hours'));`;
  runWrangler({ ...args, command });
}
function isSkippableMigrationError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  if (!msg) return false;
  return (
    msg.includes('duplicate column name') ||
    msg.includes('already exists') ||
    msg.includes('duplicate index name')
  );
}
function isMissingArchivedColumnError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return msg.includes('no such column: archived');
}
function isColumnCountMismatchError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return msg.includes('values were supplied') && msg.includes('has') && msg.includes('columns');
}
function isDataScopeConstraintError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return msg.includes('非法的数据范围配置') || msg.includes('sqlite_constraint_trigger');
}
function renderWrappedSql(entry) {
  const rawSql = migrationSql(entry);
  const executableSql = stripForbiddenTransactionSql(rawSql);
  return `-- ${entry.id} ${entry.description || ''}\n${executableSql}\nINSERT OR REPLACE INTO schema_migrations (id, name, checksum, applied_at) VALUES ('${sqlEscape(entry.id)}', '${sqlEscape(entry.file)}', '${migrationChecksum(entry)}', datetime('now','+8 hours'));\n`;
}
function printPlan(appliedRows = []) {
  const applied = new Set(appliedRows.map((row) => String(row.id)));
  for (const entry of manifest) console.log(`${applied.has(entry.id) ? 'APPLIED ' : 'PENDING '} ${entry.id}  ${entry.file}  ${entry.description || ''}`);
}
function pending(appliedRows) {
  const applied = new Set(appliedRows.map((row) => String(row.id)));
  return manifest.filter((entry) => !applied.has(entry.id));
}

function doctor(args) {
  if (!args.db) throw new Error('doctor requires --db <database_name>');
  if (!!args.remote === !!args.local) throw new Error('doctor requires exactly one of --remote or --local');

  const whoamiOut = runWranglerRaw({ wrangler: args.wrangler, argv: ['whoami'] });
  console.log(`Wrangler identity check ok: ${whoamiOut.split(/\r?\n/)[0] || 'logged in'}`);

  const listOut = runWranglerRaw({ wrangler: args.wrangler, argv: ['d1', 'list', '--json'] });
  const dbList = parseWranglerJson(listOut);
  const dbRows = extractResultsRows(dbList);
  const matched = dbRows.find((row) => String(row?.name || '') === String(args.db));
  if (!matched) {
    const names = dbRows.map((row) => String(row?.name || '')).filter(Boolean).join(', ');
    throw new Error(`D1 database '${args.db}' not found. Available: ${names || '(none)'}`);
  }
  console.log(`D1 database found: ${args.db}`);

  ensureRegistry(args);
  const applied = listApplied(args);
  const pendingRows = pending(applied);
  console.log(`Registry check ok: applied=${applied.length}, pending=${pendingRows.length}`);
}

const args = parseArgs(process.argv.slice(2));
verifyManifest();
if (args.action === 'verify') {
  console.log(`Verified ${manifest.length} migrations.`);
} else if (args.action === 'plan') {
  printPlan();
} else if (args.action === 'bundle') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-migrations-'));
  const file = path.join(dir, 'bundle.sql');
  fs.writeFileSync(file, [registrySql.trim(), ...manifest.map(renderWrappedSql)].join('\n\n'));
  console.log(file);
} else if (args.action === 'status') {
  if (!args.db) throw new Error('status requires --db <database_name>');
  ensureRegistry(args); printPlan(listApplied(args));
} else if (args.action === 'doctor') {
  doctor(args);
} else if (args.action === 'apply') {
  if (!args.db) throw new Error('apply requires --db <database_name>');
  ensureRegistry(args);
  const rows = listApplied(args);
  for (const entry of pending(rows)) {
    if (entry.id === '202604270010_users_acl_version') {
      const userColumns = listTableColumns(args, 'users');
      if (userColumns.has('acl_version')) {
        console.log(`Skipping ${entry.id} ${entry.file} (users.acl_version already exists); marking applied`);
        markApplied(args, entry);
        continue;
      }
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-migration-'));
    const file = path.join(dir, `${entry.id}.sql`);
    fs.writeFileSync(file, renderWrappedSql(entry));
    console.log(`Applying ${entry.id} ${entry.file}`);
    try {
      runWrangler({ ...args, file });
    } catch (error) {
      if (entry.id === '202603190020_asset_fk_cascade_and_archive_reason_indexes' && isMissingArchivedColumnError(error)) {
        const changed = repairAssetArchiveColumns(args);
        if (changed) console.log('Repaired archive columns for pc_assets/monitor_assets; retrying migration');
        runWrangler({ ...args, file });
        continue;
      }
      if (entry.id === '202603190020_asset_fk_cascade_and_archive_reason_indexes' && isColumnCountMismatchError(error)) {
        console.log('Detected divergent legacy table layout; applying fallback for asset cascade/index migration and marking applied');
        repairAssetArchiveColumns(args);
        applyAssetFkCascadeFallback(args);
        markApplied(args, entry);
        continue;
      }
      if (entry.id === '202603210010_user_data_scope_and_drill_closure' && isDataScopeConstraintError(error)) {
        if (!migrationSatisfied(args, entry)) throw error;
        console.log('Detected strict data-scope trigger conflict on legacy rows; schema already satisfied, marking migration applied');
        markApplied(args, entry);
        continue;
      }
      if (String(error?.message || '').toLowerCase().includes('duplicate column name')) {
        const retryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-migration-guarded-'));
        const retryFile = path.join(retryDir, `${entry.id}.sql`);
        fs.writeFileSync(retryFile, renderWrappedSqlWithAlterGuards(args, entry));
        try {
          console.log(`Retrying ${entry.id} with guarded ALTER COLUMN statements`);
          runWrangler({ ...args, file: retryFile });
          continue;
        } catch (retryError) {
          error = retryError;
        }
      }
      if (entry.id === '202603210010_user_data_scope_and_drill_closure' && isDataScopeConstraintError(error)) {
        if (!migrationSatisfied(args, entry)) throw error;
        console.log('Detected strict data-scope trigger conflict on guarded retry; schema already satisfied, marking migration applied');
        markApplied(args, entry);
        continue;
      }
      if (!isSkippableMigrationError(error)) throw error;
      if (!migrationSatisfied(args, entry)) {
        throw new Error(`Migration ${entry.id} failed and schema is not fully satisfied; manual fix required before marking applied.\n${String(error?.message || error || '')}`);
      }
      console.log(`Skipping ${entry.id} ${entry.file} (already applied structure detected and verified); marking applied`);
      markApplied(args, entry);
    }
  }
} else {
  throw new Error(`Unknown command: ${args.action}`);
}
