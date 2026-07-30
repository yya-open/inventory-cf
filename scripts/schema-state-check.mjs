import fs from 'node:fs';
import path from 'node:path';
import { defaultWranglerBin, queryWranglerD1 } from './lib/wrangler.mjs';

const root = process.cwd();
const schemaStatusPath = path.join(root, 'functions', 'api', 'services', 'schema-status.ts');
const manifestPath = path.join(root, 'sql', 'migrations.manifest.json');

function parseArgs(argv) {
  const out = { db: '', remote: false, local: false, json: false, wrangler: defaultWranglerBin() };
  const args = [...argv];
  while (args.length) {
    const cur = args.shift();
    if (cur === '--db') out.db = String(args.shift() || '');
    else if (cur === '--remote') out.remote = true;
    else if (cur === '--local') out.local = true;
    else if (cur === '--json') out.json = true;
    else if (cur === '--wrangler') out.wrangler = String(args.shift() || out.wrangler);
  }
  return out;
}

function readRequirements() {
  const raw = fs.readFileSync(schemaStatusPath, 'utf8');
  const versionMatch = raw.match(/REQUIRED_SCHEMA_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!versionMatch) throw new Error('schema-status.ts 中未找到 REQUIRED_SCHEMA_VERSION');
  const needs = [...raw.matchAll(/need:\s*'([^']+)'/g)].map((m) => m[1]);
  if (needs.length === 0) throw new Error('schema-status.ts 中未找到 need 声明');
  return { requiredVersion: versionMatch[1].trim(), needs: [...new Set(needs)] };
}

function readManifestVersion() {
  const arr = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const last = arr[arr.length - 1];
  return String((last && typeof last === 'object' ? last.id : last) || '').trim();
}

function query(args, sql) {
  return queryWranglerD1({ wrangler: args.wrangler, db: args.db, command: sql, remote: args.remote, local: args.local });
}

const args = parseArgs(process.argv.slice(2));
if (!args.db) throw new Error('db:schema-check requires --db <database_name>');
if (!!args.remote === !!args.local) throw new Error('db:schema-check requires exactly one of --remote or --local');

const { requiredVersion, needs } = readRequirements();
const manifestVersion = readManifestVersion();

const objectRows = query(args, `SELECT type, name FROM sqlite_master WHERE type IN ('table','index','trigger')`);
const objects = { table: new Set(), index: new Set(), trigger: new Set() };
for (const row of objectRows) {
  const type = String(row?.type || '').trim();
  const name = String(row?.name || '').trim();
  if (objects[type] && name) objects[type].add(name);
}

const columnNeeds = needs.filter((need) => need.includes('.'));
const objectNeeds = needs.filter((need) => !need.includes('.'));
const columnsByTable = new Map();
for (const table of new Set(columnNeeds.map((need) => need.split('.')[0]))) {
  const rows = objects.table.has(table) ? query(args, `SELECT name FROM pragma_table_info('${table}')`) : [];
  columnsByTable.set(table, new Set(rows.map((row) => String(row?.name || '').trim())));
}

const missing = [];
for (const need of objectNeeds) {
  if (!objects.table.has(need) && !objects.index.has(need) && !objects.trigger.has(need)) missing.push(need);
}
for (const need of columnNeeds) {
  const [table, column] = need.split('.');
  if (!columnsByTable.get(table)?.has(column)) missing.push(need);
}

let currentVersion = null;
if (objects.table.has('schema_migrations')) {
  const rows = query(args, `SELECT id FROM schema_migrations ORDER BY applied_at DESC, id DESC LIMIT 1`);
  currentVersion = String(rows[0]?.id || '').trim() || null;
}

const versionOk = currentVersion === requiredVersion;
const manifestOk = manifestVersion === requiredVersion;
const payload = {
  ok: missing.length === 0 && versionOk && manifestOk,
  required_version: requiredVersion,
  current_version: currentVersion,
  manifest_version: manifestVersion,
  checked: needs.length,
  missing,
};

if (args.json) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log('数据库结构检查');
  console.log('----------------');
  console.log(`${manifestOk ? '✓' : '✘'} 迁移清单版本: ${manifestVersion}${manifestOk ? '' : ` (代码要求 ${requiredVersion})`}`);
  console.log(`${versionOk ? '✓' : '✘'} 数据库当前版本: ${currentVersion || '未登记'}${versionOk ? '' : ` (代码要求 ${requiredVersion})`}`);
  console.log(`${missing.length === 0 ? '✓' : '✘'} 结构对象: ${needs.length - missing.length}/${needs.length}`);
  for (const need of missing) console.log(`  ✘ 缺少 ${need}`);
}

if (!payload.ok) process.exit(1);
