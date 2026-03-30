import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const out = {
    db: '',
    remote: false,
    local: false,
    wrangler: process.env.WRANGLER_BIN || 'wrangler',
  };
  const args = [...argv];
  while (args.length) {
    const cur = args.shift();
    if (cur === '--db') out.db = String(args.shift() || '');
    else if (cur === '--remote') out.remote = true;
    else if (cur === '--local') out.local = true;
    else if (cur === '--wrangler') out.wrangler = String(args.shift() || out.wrangler);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.db) throw new Error('audit:stats requires --db <database_name>');
const sql = `
SELECT retention_days, archive_enabled, archive_after_days, delete_after_archive, max_archive_rows,
       warn_db_size_mb, warn_audit_rows, warn_audit_bytes_mb,
       last_cleanup_at, last_archive_at, last_archive_before, last_archive_deleted_rows,
       stats_updated_at, stats_total_rows, stats_eligible_rows,
       ROUND(stats_approx_bytes / 1024.0 / 1024.0, 2) AS stats_approx_mb,
       ROUND(stats_eligible_bytes / 1024.0 / 1024.0, 2) AS stats_eligible_mb,
       ROUND(stats_db_size_bytes / 1024.0 / 1024.0, 2) AS stats_db_size_mb
  FROM audit_retention_state
 WHERE id = 1;
`;
const cmd = [args.wrangler, 'd1', 'execute', args.db];
if (args.remote) cmd.push('--remote');
if (args.local) cmd.push('--local');
cmd.push('--command', sql);
const result = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
