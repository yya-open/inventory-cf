import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const out = {
    db: '',
    remote: false,
    local: false,
    wrangler: process.env.WRANGLER_BIN || 'wrangler',
    slowDays: 30,
    errorDays: 30,
  };
  const args = [...argv];
  while (args.length) {
    const cur = args.shift();
    if (cur === '--db') out.db = String(args.shift() || '');
    else if (cur === '--remote') out.remote = true;
    else if (cur === '--local') out.local = true;
    else if (cur === '--wrangler') out.wrangler = String(args.shift() || out.wrangler);
    else if (cur === '--slow-days') out.slowDays = Math.max(1, Number(args.shift() || out.slowDays));
    else if (cur === '--error-days') out.errorDays = Math.max(1, Number(args.shift() || out.errorDays));
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.db) throw new Error('db:clean requires --db <database_name>');
const sql = `
DELETE FROM slow_request_log WHERE created_at < datetime('now','+8 hours','-${Math.trunc(args.slowDays)} days');
DELETE FROM request_error_log WHERE created_at < datetime('now','+8 hours','-${Math.trunc(args.errorDays)} days');
SELECT
  (SELECT COUNT(*) FROM slow_request_log) AS slow_rows,
  (SELECT COUNT(*) FROM request_error_log) AS error_rows;
`;
const cmd = [args.wrangler, 'd1', 'execute', args.db];
if (args.remote) cmd.push('--remote');
if (args.local) cmd.push('--local');
cmd.push('--command', sql);
const result = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
