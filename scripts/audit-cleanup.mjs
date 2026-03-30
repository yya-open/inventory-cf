import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const out = {
    db: '',
    remote: false,
    local: false,
    wrangler: process.env.WRANGLER_BIN || 'wrangler',
    days: 180,
  };
  const args = [...argv];
  while (args.length) {
    const cur = args.shift();
    if (cur === '--db') out.db = String(args.shift() || '');
    else if (cur === '--remote') out.remote = true;
    else if (cur === '--local') out.local = true;
    else if (cur === '--wrangler') out.wrangler = String(args.shift() || out.wrangler);
    else if (cur === '--days') out.days = Math.max(1, Number(args.shift() || out.days));
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.db) throw new Error('audit:cleanup requires --db <database_name>');
const sql = `
DELETE FROM audit_log WHERE created_at < datetime('now','+8 hours','-${Math.trunc(args.days)} days');
UPDATE audit_retention_state SET last_cleanup_at = datetime('now','+8 hours') WHERE id = 1;
SELECT COUNT(*) AS audit_rows FROM audit_log;
`;
const cmd = [args.wrangler, 'd1', 'execute', args.db];
if (args.remote) cmd.push('--remote');
if (args.local) cmd.push('--local');
cmd.push('--command', sql);
const result = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
