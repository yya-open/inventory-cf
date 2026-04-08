import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const out = {
    db: '',
    remote: false,
    local: false,
    wrangler: process.env.WRANGLER_BIN || 'wrangler',
    slowDays: 30,
    errorDays: 30,
    perfDays: 14,
    eventDays: 14,
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
    else if (cur === '--perf-days') out.perfDays = Math.max(1, Number(args.shift() || out.perfDays));
    else if (cur === '--event-days') out.eventDays = Math.max(1, Number(args.shift() || out.eventDays));
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.db) throw new Error('obs:cleanup requires --db <database_name>');

const sql = `
CREATE TABLE IF NOT EXISTS observability_retention_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  slow_request_days INTEGER NOT NULL DEFAULT 30,
  request_error_days INTEGER NOT NULL DEFAULT 30,
  browser_perf_days INTEGER NOT NULL DEFAULT 14,
  browser_event_days INTEGER NOT NULL DEFAULT 14,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);
CREATE TABLE IF NOT EXISTS observability_cleanup_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_reason TEXT NOT NULL DEFAULT 'manual',
  deleted_slow_request_rows INTEGER NOT NULL DEFAULT 0,
  deleted_request_error_rows INTEGER NOT NULL DEFAULT 0,
  deleted_browser_perf_rows INTEGER NOT NULL DEFAULT 0,
  deleted_browser_event_rows INTEGER NOT NULL DEFAULT 0,
  policy_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);
INSERT INTO observability_retention_policy (id, slow_request_days, request_error_days, browser_perf_days, browser_event_days, updated_at)
VALUES (1, ${Math.trunc(args.slowDays)}, ${Math.trunc(args.errorDays)}, ${Math.trunc(args.perfDays)}, ${Math.trunc(args.eventDays)}, datetime('now','+8 hours'))
ON CONFLICT(id) DO UPDATE SET
  slow_request_days=excluded.slow_request_days,
  request_error_days=excluded.request_error_days,
  browser_perf_days=excluded.browser_perf_days,
  browser_event_days=excluded.browser_event_days,
  updated_at=datetime('now','+8 hours');
INSERT INTO observability_cleanup_runs (
  run_reason,
  deleted_slow_request_rows,
  deleted_request_error_rows,
  deleted_browser_perf_rows,
  deleted_browser_event_rows,
  policy_json,
  created_at
)
VALUES (
  'manual',
  (SELECT COUNT(*) FROM slow_request_log WHERE created_at < datetime('now','+8 hours','-${Math.trunc(args.slowDays)} days')),
  (SELECT COUNT(*) FROM request_error_log WHERE created_at < datetime('now','+8 hours','-${Math.trunc(args.errorDays)} days')),
  (SELECT COUNT(*) FROM browser_perf_log WHERE created_at < datetime('now','+8 hours','-${Math.trunc(args.perfDays)} days')),
  (SELECT COUNT(*) FROM browser_event_log WHERE created_at < datetime('now','+8 hours','-${Math.trunc(args.eventDays)} days')),
  json_object('slow_request_days',${Math.trunc(args.slowDays)},'request_error_days',${Math.trunc(args.errorDays)},'browser_perf_days',${Math.trunc(args.perfDays)},'browser_event_days',${Math.trunc(args.eventDays)}),
  datetime('now','+8 hours')
);
DELETE FROM slow_request_log WHERE created_at < datetime('now','+8 hours','-${Math.trunc(args.slowDays)} days');
DELETE FROM request_error_log WHERE created_at < datetime('now','+8 hours','-${Math.trunc(args.errorDays)} days');
DELETE FROM browser_perf_log WHERE created_at < datetime('now','+8 hours','-${Math.trunc(args.perfDays)} days');
DELETE FROM browser_event_log WHERE created_at < datetime('now','+8 hours','-${Math.trunc(args.eventDays)} days');
SELECT COUNT(*) AS slow_request_rows FROM slow_request_log;
SELECT COUNT(*) AS request_error_rows FROM request_error_log;
SELECT COUNT(*) AS browser_perf_rows FROM browser_perf_log;
SELECT COUNT(*) AS browser_event_rows FROM browser_event_log;
`;

const cmd = [args.wrangler, 'd1', 'execute', args.db];
if (args.remote) cmd.push('--remote');
if (args.local) cmd.push('--local');
cmd.push('--command', sql);
const result = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
