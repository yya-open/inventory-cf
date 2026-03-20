import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'sql', 'migrations.manifest.json');
const schemaStatusPath = path.join(root, 'functions', 'api', 'services', 'schema-status.ts');
const functionsDir = path.join(root, 'functions');

function fail(message) {
  console.error(`✘ ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`✓ ${message}`);
}

function readLatestManifestVersion() {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('migrations.manifest.json 为空');
  const last = arr[arr.length - 1];
  return String((last && typeof last === 'object' ? last.id : last) || '').trim();
}

function readRequiredSchemaVersion() {
  const raw = fs.readFileSync(schemaStatusPath, 'utf8');
  const match = raw.match(/REQUIRED_SCHEMA_VERSION\s*=\s*'([^']+)'/);
  if (!match) throw new Error('schema-status.ts 中未找到 REQUIRED_SCHEMA_VERSION');
  return match[1].trim();
}

console.log('发布前检查（本地静态）');
console.log('----------------------');

try {
  if (!fs.existsSync(manifestPath)) fail('缺少 sql/migrations.manifest.json');
  else ok('迁移清单存在');

  if (!fs.existsSync(schemaStatusPath)) fail('缺少 functions/api/services/schema-status.ts');
  else ok('Schema 状态定义存在');

  if (!fs.existsSync(functionsDir)) fail('缺少 functions 目录');
  else ok('Functions 目录存在');

  ok('不依赖 wrangler.toml；Pages Functions 编译使用 CLI 参数');

  if (process.exitCode) process.exit(process.exitCode);

  const latest = readLatestManifestVersion();
  const required = readRequiredSchemaVersion();
  console.log(`最新迁移版本: ${latest}`);
  console.log(`代码要求版本: ${required}`);
  if (latest !== required) fail('最新迁移版本与代码要求版本不一致，请同步 schema-status.ts 与 migrations.manifest.json');
  else ok('迁移版本与代码要求版本一致');

  const runtimeFiles = fs.readdirSync(path.join(root, 'functions', 'api')).filter((v) => v.endsWith('.ts'));
  if (runtimeFiles.length === 0) fail('functions/api 下未发现可编译入口');
  else ok(`Functions 入口数量: ${runtimeFiles.length}`);

  console.log('\n建议执行:');
  console.log('  npm run verify:release');
  console.log('  npm run migrate:status -- --db <your_db> --remote');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (process.exitCode) process.exit(process.exitCode);
