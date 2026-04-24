import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packagePath = path.join(root, 'package.json');
const schemaStatusPath = path.join(root, 'functions', 'api', 'services', 'schema-status.ts');
const runtimeSchemaPath = path.join(root, 'functions', 'api', '_schema.ts');
const backupSchemaPath = path.join(root, 'functions', 'api', 'admin', '_backup_schema.ts');
const manifestPath = path.join(root, 'sql', 'migrations.manifest.json');
const tsconfigFunctionsPath = path.join(root, 'tsconfig.functions.json');
const dbIntegrityScriptPath = path.join(root, 'scripts', 'db-integrity-check.mjs');
const migrationSqlPath = path.join(root, 'sql', 'migrate_backup_restore_integrity_guards.sql');

function fail(message) {
  console.error(`✘ ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`✓ ${message}`);
}

function requireIncludes(text, pattern, label) {
  if (!text.includes(pattern)) fail(`缺少 ${label}`);
  else ok(`${label} 存在`);
}

function readRequiredSchemaVersion(text) {
  const match = text.match(/REQUIRED_SCHEMA_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!match) {
    fail('schema-status.ts 中未找到 REQUIRED_SCHEMA_VERSION');
    return '';
  }
  return String(match[1] || '').trim();
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const scripts = pkg.scripts || {};
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const latest = manifest[manifest.length - 1]?.id || '';
const schemaStatusText = fs.readFileSync(schemaStatusPath, 'utf8');
const runtimeSchemaText = fs.readFileSync(runtimeSchemaPath, 'utf8');
const backupSchemaText = fs.readFileSync(backupSchemaPath, 'utf8');
const requiredVersion = readRequiredSchemaVersion(schemaStatusText);

console.log('备份/恢复与发布护栏静态检查');
console.log('------------------------------');

if (!fs.existsSync(tsconfigFunctionsPath)) fail('缺少 tsconfig.functions.json');
else ok('Functions TypeScript 配置存在');

if (!fs.existsSync(dbIntegrityScriptPath)) fail('缺少 scripts/db-integrity-check.mjs');
else ok('数据库一致性检查脚本存在');

if (!fs.existsSync(migrationSqlPath)) fail('缺少 sql/migrate_backup_restore_integrity_guards.sql');
else ok('备份恢复/数据完整性迁移存在');

for (const name of ['typecheck:functions', 'test:guards', 'check:backup-restore-guards', 'db:integrity']) {
  if (!scripts[name]) fail(`package.json 缺少脚本 ${name}`);
  else ok(`package.json 已定义脚本 ${name}`);
}

if (!String(latest).trim()) {
  fail('迁移清单为空，无法确定最新迁移版本');
} else if (!requiredVersion) {
  fail(`Schema 状态要求版本为空，当前最新迁移为 ${latest}`);
} else if (String(latest).trim() !== requiredVersion) {
  fail(`最新迁移版本与 Schema 状态要求版本不一致：latest=${latest}，required=${requiredVersion}`);
} else {
  ok('迁移清单已指向最新完整性版本');
}

requireIncludes(schemaStatusText, `REQUIRED_SCHEMA_VERSION = "${requiredVersion}"`, 'Schema 状态要求版本');
requireIncludes(schemaStatusText, 'restore_job.integrity_status', '恢复任务完整性状态检查');
requireIncludes(schemaStatusText, 'trg_users_data_scope_valid_insert', '用户范围触发器检查');
requireIncludes(runtimeSchemaText, 'idx_restore_job_integrity_status', '恢复任务完整性索引');
requireIncludes(runtimeSchemaText, 'ALTER TABLE restore_job ADD COLUMN validation_json', '恢复任务校验列升级');
requireIncludes(runtimeSchemaText, 'trg_stock_qty_non_negative_insert', '库存非负触发器');
requireIncludes(runtimeSchemaText, 'trg_users_data_scope_valid_insert', '用户范围约束触发器');
requireIncludes(backupSchemaText, "inventory-cf-backup-v3", '备份版本 v3');
requireIncludes(backupSchemaText, 'LEGACY_BACKUP_VERSIONS', '旧备份兼容声明');

if (process.exitCode) process.exit(process.exitCode);
