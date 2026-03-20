import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist', 'assets');

const budgets = [
  { key: 'app_chunk', label: '普通页面 JS chunk', maxBytes: 80 * 1024, match: /^(?!element-plus|xlsx|vendor|vue-vendor).+\.js$/ },
  { key: 'vendor', label: '通用 vendor chunk', maxBytes: 200 * 1024, match: /^vendor-.*\.js$/ },
  { key: 'vue_vendor', label: 'Vue 运行时 chunk', maxBytes: 140 * 1024, match: /^vue-vendor-.*\.js$/ },
  { key: 'element_plus', label: 'Element Plus chunk', maxBytes: 900 * 1024, match: /^element-plus-.*\.js$/ },
  { key: 'xlsx', label: 'Excel 处理 chunk', maxBytes: 450 * 1024, match: /^xlsx-.*\.js$/ },
];

function fmt(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

function fail(msg) {
  console.error(`✘ ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

console.log('前端性能预算检查');
console.log('----------------');

if (!fs.existsSync(distDir)) {
  fail('dist/assets 不存在，请先执行 npm run build');
  process.exit(process.exitCode || 1);
}

const files = fs.readdirSync(distDir).filter((name) => name.endsWith('.js')).map((name) => ({
  name,
  bytes: fs.statSync(path.join(distDir, name)).size,
}));

for (const budget of budgets) {
  const matched = files.filter((file) => budget.match.test(file.name));
  if (!matched.length) {
    ok(`${budget.label}: 未命中产物，跳过`);
    continue;
  }
  const biggest = matched.reduce((max, item) => (item.bytes > max.bytes ? item : max), matched[0]);
  if (biggest.bytes > budget.maxBytes) fail(`${budget.label} 超预算：${biggest.name} = ${fmt(biggest.bytes)}，预算 ${fmt(budget.maxBytes)}`);
  else ok(`${budget.label} 通过：${biggest.name} = ${fmt(biggest.bytes)} / 预算 ${fmt(budget.maxBytes)}`);
}

if (process.exitCode) process.exit(process.exitCode);
