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
function parseArgs(argv) {
  const out = { command: 'plan', db: '', remote: false, local: false, wrangler: process.env.WRANGLER_BIN || 'wrangler' };
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
  if (remote) args.push('--remote');
  if (local) args.push('--local');
  if (json) args.push('--json');
  if (command) args.push('--command', command);
  if (file) args.push('--file', file);
  const result = spawnSync(wrangler, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `wrangler exited with ${result.status}`);
  return result.stdout.trim();
}
function ensureRegistry(args) { runWrangler({ ...args, command: registrySql }); }
function listApplied(args) {
  const out = runWrangler({ ...args, json: true, command: 'SELECT id, name, checksum, applied_at FROM schema_migrations ORDER BY id' });
  const parsed = JSON.parse(out || '[]');
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const first = rows[0] || {};
  return Array.isArray(first.results) ? first.results : [];
}
function listTableColumns(args, tableName) {
  const out = runWrangler({ ...args, json: true, command: `PRAGMA table_info(${tableName})` });
  const parsed = JSON.parse(out || '[]');
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const first = rows[0] || {};
  const cols = Array.isArray(first.results) ? first.results : [];
  return new Set(cols.map((row) => String(row?.name || '').trim()).filter(Boolean));
}
function migrationSql(entry) {
  return fs.readFileSync(path.join(root, entry.file), 'utf8').trim();
}
function migrationChecksum(entry) {
  return sha256(migrationSql(entry));
}
function markApplied(args, entry) {
  const command = `INSERT OR REPLACE INTO schema_migrations (id, name, checksum, applied_at) VALUES ('${sqlEscape(entry.id)}', '${sqlEscape(entry.file)}', '${migrationChecksum(entry)}', datetime('now','+8 hours'));`;
  runWrangler({ ...args, command });
}
function renderWrappedSql(entry) {
  const sql = migrationSql(entry);
  return `-- ${entry.id} ${entry.description || ''}\nBEGIN;\n${sql}\nINSERT OR REPLACE INTO schema_migrations (id, name, checksum, applied_at) VALUES ('${sqlEscape(entry.id)}', '${sqlEscape(entry.file)}', '${migrationChecksum(entry)}', datetime('now','+8 hours'));\nCOMMIT;\n`;
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
    runWrangler({ ...args, file });
  }
} else {
  throw new Error(`Unknown command: ${args.command}`);
}
