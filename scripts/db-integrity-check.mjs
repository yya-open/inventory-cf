import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const out = { db: '', remote: false, local: false, json: false, wrangler: process.env.WRANGLER_BIN || 'wrangler' };
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

const checks = [
  { key: 'blank_username', label: '空用户名', severity: 'error', sql: `SELECT COUNT(*) AS c FROM users WHERE TRIM(COALESCE(username, '')) = ''` },
  { key: 'invalid_user_scope', label: '非法数据范围组合', severity: 'error', sql: `SELECT COUNT(*) AS c FROM users WHERE NOT (((LOWER(TRIM(COALESCE(data_scope_type, 'all'))) = 'all') AND TRIM(COALESCE(data_scope_value, '')) = '' AND TRIM(COALESCE(data_scope_value2, '')) = '') OR ((LOWER(TRIM(COALESCE(data_scope_type, 'all'))) = 'department') AND TRIM(COALESCE(data_scope_value, '')) <> '' AND TRIM(COALESCE(data_scope_value2, '')) = '') OR ((LOWER(TRIM(COALESCE(data_scope_type, 'all'))) = 'warehouse') AND TRIM(COALESCE(data_scope_value, '')) <> '' AND TRIM(COALESCE(data_scope_value2, '')) = '') OR ((LOWER(TRIM(COALESCE(data_scope_type, 'all'))) = 'department_warehouse') AND TRIM(COALESCE(data_scope_value, '')) <> '' AND TRIM(COALESCE(data_scope_value2, '')) <> ''))` },
  { key: 'negative_stock_qty', label: '负库存', severity: 'error', sql: `SELECT COUNT(*) AS c FROM stock WHERE COALESCE(qty, 0) < 0` },
  { key: 'blank_pc_serial', label: '空电脑序列号', severity: 'error', sql: `SELECT COUNT(*) AS c FROM pc_assets WHERE TRIM(COALESCE(serial_no, '')) = ''` },
  { key: 'blank_monitor_asset_code', label: '空显示器资产编码', severity: 'error', sql: `SELECT COUNT(*) AS c FROM monitor_assets WHERE TRIM(COALESCE(asset_code, '')) = ''` },
  { key: 'orphan_pc_latest_state', label: '游离电脑快照', severity: 'warn', sql: `SELECT COUNT(*) AS c FROM pc_asset_latest_state s LEFT JOIN pc_assets a ON a.id = s.asset_id WHERE a.id IS NULL` },
  { key: 'orphan_monitor_tx_asset', label: '游离显示器流水', severity: 'warn', sql: `SELECT COUNT(*) AS c FROM monitor_tx t LEFT JOIN monitor_assets a ON a.id = t.asset_id WHERE a.id IS NULL` },
];

function runWrangler(args, sql) {
  const wranglerArgs = ['d1', 'execute', args.db];
  if (args.remote) wranglerArgs.push('--remote');
  if (args.local) wranglerArgs.push('--local');
  wranglerArgs.push('--json', '--command', sql);
  const result = spawnSync(args.wrangler, wranglerArgs, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `wrangler exited with ${result.status}`);
  }
  const parsed = JSON.parse(result.stdout || '[]');
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return Array.isArray(rows[0]?.results) ? rows[0].results : [];
}

function readCount(rows) {
  return Number(rows[0]?.c || 0);
}

const args = parseArgs(process.argv.slice(2));
if (!args.db) throw new Error('db:integrity requires --db <database_name>');

const output = [];
let hasError = false;
for (const check of checks) {
  const count = readCount(runWrangler(args, check.sql));
  output.push({ key: check.key, label: check.label, severity: check.severity, count });
  if (check.severity === 'error' && count > 0) hasError = true;
}
const fkRows = runWrangler(args, 'PRAGMA foreign_key_check');
const quickRows = runWrangler(args, 'PRAGMA quick_check');
const quickValue = String(quickRows[0]?.quick_check || quickRows[0]?.integrity_check || quickRows[0]?.result || '').trim();
const payload = {
  ok: !hasError && fkRows.length === 0 && (!quickValue || quickValue.toLowerCase() === 'ok'),
  checks: output,
  foreign_key_violations: fkRows.length,
  quick_check: quickValue || 'ok',
};

if (args.json) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log('数据库一致性检查');
  console.log('----------------');
  for (const item of output) {
    console.log(`${item.count > 0 ? '✘' : '✓'} ${item.label}: ${item.count}`);
  }
  console.log(`${fkRows.length > 0 ? '✘' : '✓'} foreign_key_check: ${fkRows.length}`);
  console.log(`${payload.quick_check.toLowerCase() === 'ok' ? '✓' : '✘'} quick_check: ${payload.quick_check}`);
}

if (!payload.ok) process.exit(1);
