import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'sql', 'migrations.manifest.json');

const registrySql = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
ON schema_migrations(applied_at);
`;

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function parseArgs(argv) {
  const out = {
    command: 'plan',
    db: '',
    remote: false,
    local: false,
    wrangler: process.env.WRANGLER_BIN || 'wrangler',
  };

  const args = [...argv];
  if (args[0] && !args[0].startsWith('--')) {
    out.command = args.shift();
  }

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
  const ids = new Set();
  let prev = '';

  for (const entry of manifest) {
    if (!entry.id || !entry.file) {
      throw new Error(`Invalid manifest entry: ${JSON.stringify(entry)}`);
    }
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate migration id: ${entry.id}`);
    }
    if (prev && entry.id < prev) {
      throw new Error(`Manifest out of order: ${entry.id} < ${prev}`);
    }

    const abs = path.join(root, entry.file);
    if (!fs.existsSync(abs)) {
      throw new Error(`Missing migration file: ${entry.file}`);
    }

    ids.add(entry.id);
    prev = entry.id;
  }
}

function resolveCommand(wrangler, args) {
  const isWin = process.platform === 'win32';

  if (wrangler === 'npx') {
    return {
      bin: isWin ? 'npx.cmd' : 'npx',
      args: ['wrangler', ...args],
    };
  }

  if (isWin && !/[\\/]/.test(wrangler) && !/\.(cmd|exe|bat)$/i.test(wrangler)) {
    return {
      bin: `${wrangler}.cmd`,
      args,
    };
  }

  return {
    bin: wrangler,
    args,
  };
}

function runWrangler({ wrangler, db, command, file, remote, local, json = false }) {
  const args = ['d1', 'execute', db];

  if (remote) args.push('--remote');
  if (local) args.push('--local');
  if (json) args.push('--json');
  if (command) args.push('--command', command);
  if (file) args.push('--file', file);

  const resolved = resolveCommand(wrangler, args);

  const result = spawnSync(resolved.bin, resolved.args, {
    cwd: root,
    encoding: 'utf8',
  });

  if (result.error) {
    throw new Error(`Failed to launch ${resolved.bin}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(
      (result.stderr || '').trim() ||
        (result.stdout || '').trim() ||
        `wrangler exited with ${result.status}`
    );
  }

  return (result.stdout || '').trim();
}

function ensureRegistry(args) {
  runWrangler({ ...args, command: registrySql });
}

function listApplied(args) {
  const out = runWrangler({
    ...args,
    json: true,
    command: 'SELECT id, name, checksum, applied_at FROM schema_migrations ORDER BY id',
  });

  const parsed = JSON.parse(out || '[]');
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const first = rows[0] || {};

  return Array.isArray(first.results) ? first.results : [];
}

function renderWrappedSql(entry) {
  const sql = fs.readFileSync(path.join(root, entry.file), 'utf8').trim();
  const checksum = sha256(sql);

  return [
    `-- ${entry.id} ${entry.description || ''}`,
    'BEGIN;',
    sql,
    `INSERT OR REPLACE INTO schema_migrations (id, name, checksum, applied_at) VALUES ('${entry.id}', '${entry.file}', '${checksum}', datetime('now','+8 hours'));`,
    'COMMIT;',
    '',
  ].join('\n');
}

function printPlan(appliedRows = []) {
  const applied = new Set(appliedRows.map((row) => String(row.id)));

  for (const entry of manifest) {
    const state = applied.has(entry.id) ? 'APPLIED ' : 'PENDING ';
    console.log(`${state} ${entry.id}  ${entry.file}  ${entry.description || ''}`);
  }
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
  if (!args.db) {
    throw new Error('status requires --db <database_name>');
  }
  ensureRegistry(args);
  printPlan(listApplied(args));
} else if (args.command === 'apply') {
  if (!args.db) {
    throw new Error('apply requires --db <database_name>');
  }

  ensureRegistry(args);
  const rows = listApplied(args);

  for (const entry of pending(rows)) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-migration-'));
    const file = path.join(dir, `${entry.id}.sql`);
    fs.writeFileSync(file, renderWrappedSql(entry));
    console.log(`Applying ${entry.id} ${entry.file}`);
    runWrangler({ ...args, file });
  }
} else {
  throw new Error(`Unknown command: ${args.command}`);
}