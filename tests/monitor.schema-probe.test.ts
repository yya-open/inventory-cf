import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Two guards live in this file:
 *  1. behavioral - ensureMonitorSchemaIfAllowed must stay a read-only, one-batch, cached probe;
 *  2. static - every object the probe REQUIRES must be created by committed SQL, otherwise the
 *     probe can never cache readiness and re-runs forever on every hot read path.
 */

const MONITOR_SCHEMA_PROBE_TTL_MS = 10 * 60_000;

// ---------------------------------------------------------------------------
// probe source parsing
// ---------------------------------------------------------------------------

type ObjectProbe = { kind: 'object'; type: string; name: string; sql: string };
type ColumnProbe = { kind: 'column'; table: string; column: string; sql: string };
type ProbeDescriptor = ObjectProbe | ColumnProbe;

type ParsedProbe = {
  statements: string[];
  descriptors: ProbeDescriptor[];
};

const SQLITE_MASTER_PROBE = /FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'(\w+)'\s+AND\s+name\s*=\s*'([A-Za-z_]\w*)'/i;
const PRAGMA_COLUMN_PROBE = /FROM\s+pragma_table_info\(\s*'(\w+)'\s*\)\s+WHERE\s+name\s*=\s*'([A-Za-z_]\w*)'/i;
const PREPARE_CALL = /db\.prepare\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1\s*\)/g;

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

function probeLabel(descriptor: ProbeDescriptor): string {
  return descriptor.kind === 'column' ? `${descriptor.table}.${descriptor.column}` : descriptor.name;
}

/** brace-matched body of `async function <name>(...) { ... }`, quote aware */
function extractFunctionBody(source: string, functionName: string): string {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`probe function not found: ${functionName}`);
  const open = source.indexOf('{', start);
  if (open < 0) throw new Error(`probe function has no body: ${functionName}`);

  let depth = 0;
  let quote = '';
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced probe body: ${functionName}`);
}

function parseProbe(relativePath: string, functionName: string): ParsedProbe {
  const body = extractFunctionBody(readRepoFile(relativePath), functionName);
  const prepareCalls = body.match(/db\.prepare\(/g)?.length ?? 0;
  const statements: string[] = [];
  const descriptors: ProbeDescriptor[] = [];

  PREPARE_CALL.lastIndex = 0;
  for (let match = PREPARE_CALL.exec(body); match; match = PREPARE_CALL.exec(body)) {
    const sql = match[2].replace(/\\(["'`\\])/g, '$1');
    statements.push(sql);

    const objectMatch = SQLITE_MASTER_PROBE.exec(sql);
    if (objectMatch) {
      descriptors.push({ kind: 'object', type: objectMatch[1].toLowerCase(), name: objectMatch[2], sql });
      continue;
    }
    const columnMatch = PRAGMA_COLUMN_PROBE.exec(sql);
    if (columnMatch) {
      descriptors.push({ kind: 'column', table: columnMatch[1], column: columnMatch[2], sql });
    }
  }

  // Fail loudly instead of silently skipping a probe shape the parser does not understand.
  if (statements.length !== prepareCalls) {
    throw new Error(`${functionName}: parsed ${statements.length} of ${prepareCalls} db.prepare(...) calls`);
  }
  if (descriptors.length !== statements.length) {
    const unparsed = statements.filter(
      (sql) => !SQLITE_MASTER_PROBE.test(sql) && !PRAGMA_COLUMN_PROBE.test(sql),
    );
    throw new Error(`${functionName}: unrecognized probe statement(s): ${JSON.stringify(unparsed)}`);
  }
  if (descriptors.length === 0) throw new Error(`${functionName}: no probe statements found`);

  return { statements, descriptors };
}

// ---------------------------------------------------------------------------
// committed SQL truth (sql/init.sql + sql/schema.sql + every manifest migration)
// ---------------------------------------------------------------------------

type SqlTruth = {
  /** sqlite_master type -> object names created by committed SQL */
  objects: Map<string, Set<string>>;
  /** table -> column names created by CREATE TABLE bodies or ALTER TABLE ADD COLUMN */
  columns: Map<string, Set<string>>;
  files: string[];
};

const CREATE_TABLE = /CREATE\s+(?:VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_]\w*)/gi;
const CREATE_INDEX = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_]\w*)/gi;
const CREATE_TRIGGER = /CREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_]\w*)/gi;
const CREATE_VIEW = /CREATE\s+VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_]\w*)/gi;
const ADD_COLUMN = /ALTER\s+TABLE\s+([A-Za-z_]\w*)\s+ADD\s+COLUMN\s+([A-Za-z_]\w*)/gi;
const CONSTRAINT_HEADS: Record<string, true> = {
  primary: true,
  foreign: true,
  unique: true,
  check: true,
  constraint: true,
  key: true,
};

/** column names declared in the CREATE TABLE body that starts after `fromIndex` */
function tableBodyColumns(sql: string, fromIndex: number): string[] {
  const open = sql.indexOf('(', fromIndex);
  if (open < 0) return [];
  // `CREATE TABLE x AS SELECT ...` / `CREATE VIRTUAL TABLE x USING fts5(...)` carry no plain column list
  if (/\S/.test(sql.slice(fromIndex, open))) return [];

  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let quote = '';
  for (let i = open; i < sql.length; i += 1) {
    const ch = sql[i];
    if (quote) {
      if (ch === quote) quote = '';
      current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      if (depth === 1) continue;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        parts.push(current);
        break;
      }
    } else if (ch === ',' && depth === 1) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }

  return parts
    .map((part) => part.trim().split(/[\s(]/)[0])
    .filter((head) => /^[A-Za-z_]\w*$/.test(head) && !CONSTRAINT_HEADS[head.toLowerCase()]);
}

function addObject(truth: SqlTruth, type: string, name: string) {
  const bucket = truth.objects.get(type) ?? new Set<string>();
  bucket.add(name);
  truth.objects.set(type, bucket);
}

function addColumn(truth: SqlTruth, table: string, column: string) {
  const bucket = truth.columns.get(table) ?? new Set<string>();
  bucket.add(column);
  truth.columns.set(table, bucket);
}

function committedSqlFiles(): string[] {
  const manifest = JSON.parse(readRepoFile('sql/migrations.manifest.json')) as Array<{ id: string; file: string }>;
  // Non-manifest patch_*.sql files are deliberately ignored: scripts/migrations.mjs never applies them.
  return ['sql/init.sql', 'sql/schema.sql', ...manifest.map((entry) => entry.file)];
}

function buildSqlTruth(files: string[]): SqlTruth {
  const truth: SqlTruth = { objects: new Map(), columns: new Map(), files };

  for (const file of files) {
    // strip block and line comments so commented-out DDL never counts as committed SQL
    const sql = readRepoFile(file).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

    CREATE_TABLE.lastIndex = 0;
    for (let match = CREATE_TABLE.exec(sql); match; match = CREATE_TABLE.exec(sql)) {
      const table = match[1];
      addObject(truth, 'table', table);
      for (const column of tableBodyColumns(sql, match.index + match[0].length)) addColumn(truth, table, column);
    }
    for (const [regex, type] of [
      [CREATE_INDEX, 'index'],
      [CREATE_TRIGGER, 'trigger'],
      [CREATE_VIEW, 'view'],
    ] as const) {
      regex.lastIndex = 0;
      for (let match = regex.exec(sql); match; match = regex.exec(sql)) addObject(truth, type, match[1]);
    }
    ADD_COLUMN.lastIndex = 0;
    for (let match = ADD_COLUMN.exec(sql); match; match = ADD_COLUMN.exec(sql)) addColumn(truth, match[1], match[2]);
  }

  return truth;
}

function unresolvedProbes(descriptors: ProbeDescriptor[], truth: SqlTruth): string[] {
  return descriptors
    .filter((descriptor) =>
      descriptor.kind === 'column'
        ? !truth.columns.get(descriptor.table)?.has(descriptor.column)
        : !truth.objects.get(descriptor.type)?.has(descriptor.name),
    )
    .map(probeLabel);
}

const monitorProbe = parseProbe('functions/api/_monitor.ts', 'probeMonitorSchemaReady');
const pcProbe = parseProbe('functions/api/_pc.ts', 'probePcSchemaReady');
const asyncJobsProbe = parseProbe('functions/api/services/async-jobs.ts', 'probeAsyncJobsSchemaReady');
const browserObservabilityProbe = parseProbe('functions/api/services/observability.ts', 'probeBrowserObservabilityReady');
const sqlTruth = buildSqlTruth(committedSqlFiles());

// ---------------------------------------------------------------------------
// behavioral guard
// ---------------------------------------------------------------------------

class FakeMonitorStatement {
  constructor(readonly sql: string, private readonly db: FakeMonitorDb) {}

  bind(..._args: unknown[]) {
    return this;
  }

  async run() {
    this.db.runs.push(this.sql);
    return { success: true, meta: {} };
  }

  async first() {
    return { ok: this.db.okFor(this.sql) };
  }

  async all() {
    return { success: true, results: [{ ok: this.db.okFor(this.sql) }] };
  }
}

class FakeMonitorDb {
  /** every SQL string handed to prepare(), whether or not it is later executed */
  readonly prepared: string[] = [];
  /** one entry per batch() call, holding that batch's SQL strings in order */
  readonly batches: string[][] = [];
  readonly runs: string[] = [];
  readonly execs: string[] = [];

  constructor(private readonly objectExists: (probed: string) => boolean) {}

  prepare(sql: string) {
    this.prepared.push(sql);
    return new FakeMonitorStatement(sql, this);
  }

  async batch(statements: FakeMonitorStatement[]) {
    this.batches.push(statements.map((statement) => statement.sql));
    return statements.map((statement) => ({
      success: true,
      results: [{ ok: this.okFor(statement.sql) }],
      meta: {},
    }));
  }

  async exec(sql: string) {
    this.execs.push(sql);
    return { count: 0, duration: 0 };
  }

  okFor(sql: string): number {
    const names = [...sql.matchAll(/name\s*=\s*'([A-Za-z_]\w*)'/g)];
    if (names.length === 0) throw new Error(`Unexpected probe SQL: ${sql}`);
    return this.objectExists(names[names.length - 1][1]) ? 1 : 0;
  }

  /** schema mutation on a read path is exactly the regression this file guards against */
  get schemaMutations(): string[] {
    return [...this.prepared, ...this.runs, ...this.execs].filter(
      (sql) => sql.includes('CREATE ') || sql.includes('ALTER ') || sql.includes('DROP '),
    );
  }
}

// __monitorSchemaReady / __monitorSchemaProbeAt are module-level, so every case below reloads
// the module and drives its own clock: the file stays order-insensitive.
async function loadMonitorModule() {
  vi.resetModules();
  return import('../functions/api/_monitor');
}

const MONITOR_TX_URL = new URL('https://x/api/monitor-tx');

describe('monitor schema readiness probe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs one read-only probe batch and caches readiness when every probed object exists', async () => {
    const { ensureMonitorSchemaIfAllowed } = await loadMonitorModule();
    const fake = new FakeMonitorDb(() => true);
    // The fake only implements the D1 surface the probe uses (prepare/bind/run/first/all/batch/exec).
    const db = fake as unknown as D1Database;

    await ensureMonitorSchemaIfAllowed(db, {}, MONITOR_TX_URL);

    expect(fake.batches).toHaveLength(1);
    expect(fake.batches[0]).toEqual(monitorProbe.statements);
    expect(fake.batches[0].every((sql) => sql.startsWith('SELECT 1 AS ok FROM'))).toBe(true);
    expect(fake.schemaMutations).toEqual([]);
    expect(fake.runs).toEqual([]);
    expect(fake.execs).toEqual([]);

    await ensureMonitorSchemaIfAllowed(db, {}, MONITOR_TX_URL);

    expect(fake.batches).toHaveLength(1);
    expect(fake.prepared).toHaveLength(monitorProbe.statements.length);
    expect(fake.schemaMutations).toEqual([]);
  });

  it('never emits DDL and retries the probe only after the 10 minute TTL when an object is missing', async () => {
    const { ensureMonitorSchemaIfAllowed } = await loadMonitorModule();
    const missing = 'idx_monitor_assets_archived_location_id';
    const fake = new FakeMonitorDb((probed) => probed !== missing);
    // The fake only implements the D1 surface the probe uses (prepare/bind/run/first/all/batch/exec).
    const db = fake as unknown as D1Database;

    await ensureMonitorSchemaIfAllowed(db, {}, MONITOR_TX_URL);
    await ensureMonitorSchemaIfAllowed(db, {}, MONITOR_TX_URL);

    expect(fake.batches).toHaveLength(1);

    vi.advanceTimersByTime(MONITOR_SCHEMA_PROBE_TTL_MS - 1);
    await ensureMonitorSchemaIfAllowed(db, {}, MONITOR_TX_URL);

    expect(fake.batches).toHaveLength(1);

    vi.advanceTimersByTime(1);
    await ensureMonitorSchemaIfAllowed(db, {}, MONITOR_TX_URL);

    expect(fake.batches).toHaveLength(2);
    expect(fake.batches[1]).toEqual(monitorProbe.statements);

    vi.advanceTimersByTime(MONITOR_SCHEMA_PROBE_TTL_MS);
    await ensureMonitorSchemaIfAllowed(db, {}, MONITOR_TX_URL);

    // Never converges while the object is missing - that is the cost the static guard below prevents.
    expect(fake.batches).toHaveLength(3);
    expect(fake.schemaMutations).toEqual([]);
    expect(fake.runs).toEqual([]);
    expect(fake.execs).toEqual([]);
  });

  it('converges against committed SQL: one probe batch, then no re-probe after the TTL', async () => {
    const { ensureMonitorSchemaIfAllowed } = await loadMonitorModule();
    const satisfied = new Set(
      monitorProbe.descriptors
        .filter((descriptor) => unresolvedProbes([descriptor], sqlTruth).length === 0)
        .map((descriptor) => (descriptor.kind === 'column' ? descriptor.column : descriptor.name)),
    );
    // A database holding exactly what sql/init.sql + sql/schema.sql + the manifest migrations create.
    const fake = new FakeMonitorDb((probed) => satisfied.has(probed));
    const db = fake as unknown as D1Database;

    await ensureMonitorSchemaIfAllowed(db, {}, MONITOR_TX_URL);

    expect(fake.batches).toHaveLength(1);

    vi.advanceTimersByTime(MONITOR_SCHEMA_PROBE_TTL_MS * 2);
    await ensureMonitorSchemaIfAllowed(db, {}, MONITOR_TX_URL);

    expect(fake.batches).toHaveLength(1);
    expect(fake.schemaMutations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// static convergence guard
// ---------------------------------------------------------------------------

describe('schema readiness probes resolve against committed SQL', () => {
  it('reads every SQL file the migration runner applies', () => {
    const files = committedSqlFiles();

    expect(files.length).toBeGreaterThan(2);
    expect(files.filter((file) => !existsSync(resolve(process.cwd(), file)))).toEqual([]);
    expect(sqlTruth.objects.get('table')?.has('monitor_assets')).toBe(true);
    expect(sqlTruth.objects.get('index')?.size).toBeGreaterThan(0);
  });

  it('extracts one object descriptor per monitor probe statement', () => {
    expect(monitorProbe.descriptors).toHaveLength(monitorProbe.statements.length);
    expect(monitorProbe.descriptors.map(probeLabel)).toEqual([
      'pc_locations',
      'monitor_assets',
      'idx_monitor_assets_archived_id',
      'idx_monitor_assets_archived_inventory_status_id',
      'idx_monitor_assets_archived_location_id',
      'monitor_assets.inventory_status',
      'monitor_assets.search_text_norm',
    ]);
    expect(monitorProbe.statements.some((sql) => /\b(CREATE|ALTER|DROP)\b/i.test(sql))).toBe(false);
  });

  it('creates every object probed by probeMonitorSchemaReady', () => {
    expect(unresolvedProbes(monitorProbe.descriptors, sqlTruth)).toEqual([]);
  });

  it('creates every object probed by probePcSchemaReady', () => {
    expect(pcProbe.descriptors).toHaveLength(pcProbe.statements.length);
    expect(pcProbe.descriptors.map(probeLabel)).toEqual([
      'pc_assets',
      'pc_asset_latest_state',
      'idx_pc_assets_archived_id',
      'idx_pc_assets_archived_inventory_status_id',
      'pc_assets.inventory_status',
      'pc_assets.search_text_norm',
    ]);
    expect(unresolvedProbes(pcProbe.descriptors, sqlTruth)).toEqual([]);
  });

  it('creates every object probed by probeAsyncJobsSchemaReady', () => {
    expect(asyncJobsProbe.descriptors).toHaveLength(asyncJobsProbe.statements.length);
    expect(asyncJobsProbe.descriptors.map(probeLabel)).toEqual([
      'async_jobs',
      'async_jobs.result_blob_base64',
      'async_jobs.result_object_key',
      'async_jobs.result_file_size',
      'async_jobs.retry_count',
      'async_jobs.max_retries',
      'async_jobs.cancel_requested',
      'async_jobs.canceled_at',
      'async_jobs.retain_until',
      'async_jobs.result_deleted_at',
      'async_jobs.worker_token',
      'async_jobs.lease_until',
      'idx_async_jobs_status_created_at',
      'idx_async_jobs_created_by_status',
      'idx_async_jobs_retain_until',
      'idx_async_jobs_job_type_status_created_at',
      'idx_async_jobs_created_by_job_type_status',
    ]);
    expect(asyncJobsProbe.statements.some((sql) => /\b(CREATE|ALTER|DROP)\b/i.test(sql))).toBe(false);
    expect(unresolvedProbes(asyncJobsProbe.descriptors, sqlTruth)).toEqual([]);
  });

  it('creates every object probed by probeBrowserObservabilityReady', () => {
    expect(browserObservabilityProbe.descriptors).toHaveLength(browserObservabilityProbe.statements.length);
    expect(browserObservabilityProbe.descriptors.map(probeLabel)).toEqual([
      'browser_perf_log',
      'browser_event_log',
      'idx_browser_perf_log_path_duration_created',
      'idx_browser_event_log_path_event_created',
    ]);
    expect(browserObservabilityProbe.statements.some((sql) => /\b(CREATE|ALTER|DROP)\b/i.test(sql))).toBe(false);
    expect(unresolvedProbes(browserObservabilityProbe.descriptors, sqlTruth)).toEqual([]);
  });

  it('negative control: dropping the location index from SQL truth is reported by name', () => {
    const withoutIndex = buildSqlTruth(committedSqlFiles());
    withoutIndex.objects.get('index')?.delete('idx_monitor_assets_archived_location_id');

    expect(unresolvedProbes(monitorProbe.descriptors, withoutIndex)).toEqual([
      'idx_monitor_assets_archived_location_id',
    ]);
  });
});
