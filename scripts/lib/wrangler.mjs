import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function defaultWranglerBin() {
  return process.env.WRANGLER_BIN || 'wrangler';
}

// On Windows the wrangler entry on PATH is a .cmd shim, which spawnSync cannot execute
// without a shell; every wrangler call therefore goes through a quoted shell command line.
export function spawnWrangler(wrangler, argv, options = {}) {
  const base = { cwd: options.cwd || repoRoot };
  if (options.stdio) base.stdio = options.stdio;
  else base.encoding = 'utf8';
  if (process.platform === 'win32') {
    const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const cmdline = [wrangler, ...argv].map(quote).join(' ');
    return spawnSync(cmdline, { ...base, shell: true });
  }
  return spawnSync(wrangler, argv, base);
}

export function runWrangler({ wrangler = defaultWranglerBin(), argv, cwd, stdio }) {
  const result = spawnWrangler(wrangler, argv, { cwd, stdio });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `wrangler exited with ${result.status}`);
  }
  return String(result.stdout || '').trim();
}

export function runWranglerD1({ wrangler = defaultWranglerBin(), db, command, file, remote, local, json = false, cwd, stdio }) {
  if (!db) throw new Error('runWranglerD1 requires a database name');
  if (command && file) throw new Error('runWranglerD1 received both command and file; choose one');
  const argv = ['d1', 'execute', db];
  if (remote) argv.push('--remote');
  if (local) argv.push('--local');
  if (json) argv.push('--json');

  // cmd.exe cannot carry embedded newlines inside a single argument, so multi-statement
  // SQL is handed to wrangler as a temporary file instead of --command.
  let tempDir = null;
  if (command != null) {
    const text = String(command);
    if (process.platform === 'win32' && /\r|\n/.test(text)) {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-wrangler-sql-'));
      const tempFile = path.join(tempDir, 'command.sql');
      fs.writeFileSync(tempFile, text);
      argv.push('--file', tempFile);
    } else {
      argv.push('--command', text);
    }
  }
  if (file) argv.push('--file', file);

  try {
    return runWrangler({ wrangler, argv, cwd, stdio });
  } finally {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export function parseWranglerJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {}

  let parsed = null;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '[' && ch !== '{') continue;
    const candidate = raw.slice(i).trim();
    try {
      parsed = JSON.parse(candidate);
    } catch {}
    if (parsed != null) break;
  }
  if (parsed != null) return parsed;
  throw new Error(`Unable to parse wrangler JSON output:\n${raw.slice(0, 500)}`);
}

export function extractResultsRows(payload) {
  const queue = [payload];
  while (queue.length) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      if (current.length && current.every((row) => row && typeof row === 'object' && !Array.isArray(row) && !('results' in row))) {
        return current;
      }
      for (const item of current) queue.push(item);
      continue;
    }
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current.results)) return current.results;
    for (const value of Object.values(current)) queue.push(value);
  }
  return [];
}

export function queryWranglerD1(options) {
  return extractResultsRows(parseWranglerJson(runWranglerD1({ ...options, json: true })));
}
