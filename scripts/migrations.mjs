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
  const out = { command: 'plan', db: '', remote: false, local: false, wrangler: process.env.WRANGLER_BIN || defaultWranglerBin() };
  const args = [...argv];
  if (args[0] && !args[0].startsWith('--')) out.command = args.shift();
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
  let tmpSqlFile = null;
  if (remote) args.push('--remote');
  if (local) args.push('--local');
  if (json) args.push('--json');
  if (command) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-migration-command-'));
    tmpSqlFile = path.join(dir, 'command.sql');
    fs.writeFileSync(tmpSqlFile, String(command || ''));
    args.push('--file', tmpSqlFile);
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
function migrationSql(entry) {
  return fs.readFileSync(path.join(root, entry.file), 'utf8').trim();
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
const args = parseArgs(process.argv.slice(2));
verifyManifest();
if (args.command === 'verify') {
  console.log(`Verified ${manifest.length} migrations.`);
} else if (args.command === 'plan') {
  printPlan();
} else if (args.command === 'bundle') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-migrations-'));
  const file = path.join(dir, 'bundle.sql');
  fs.writeFileSync(file, [registrySql.trim(), ...manifest.map(renderWrappedSql)].join('\n\n'));
  console.log(file);
} else if (args.command === 'status') {
  if (!args.db) throw new Error('status requires --db <database_name>');
  ensureRegistry(args); printPlan(listApplied(args));
} else if (args.command === 'apply') {
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
      runWrangler({ ...args, command: '', file });
    } catch (error) {
      if (!isSkippableMigrationError(error)) throw error;
      console.log(`Skipping ${entry.id} ${entry.file} (already applied structure detected); marking applied`);
      markApplied(args, entry);
    }
  }
} else {
  throw new Error(`Unknown command: ${args.command}`);
}
