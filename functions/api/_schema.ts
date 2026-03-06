// Core schema bootstrapper for non-PC warehouses.
// D1-safe: avoid PRAGMA/sqlite_master at runtime.

let __coreSchemaReady = false;
let __coreSchemaInit: Promise<void> | null = null;

async function tryRun(db: D1Database, sql: string) {
  try {
    await db.prepare(sql).run();
  } catch {
    // ignore for idempotent upgrades
  }
}

export async function ensureCoreSchema(db: D1Database) {
  if (__coreSchemaReady) return;
  if (__coreSchemaInit) return __coreSchemaInit;

  __coreSchemaInit = (async () => {
    const stmts: string[] = [
      `CREATE TABLE IF NOT EXISTS warehouses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
      )`,

      `CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        brand TEXT,
        model TEXT,
        category TEXT,
        unit TEXT NOT NULL DEFAULT '个',
        warning_qty INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_items_category ON items(category)`,

      `CREATE TABLE IF NOT EXISTS stock (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        warehouse_id INTEGER NOT NULL,
        qty INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
        UNIQUE(item_id, warehouse_id),
        FOREIGN KEY(item_id) REFERENCES items(id),
        FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_stock_wh_item ON stock(warehouse_id, item_id)`,

      `CREATE TABLE IF NOT EXISTS stock_tx (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tx_no TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL CHECK(type IN ('IN','OUT','ADJUST','REVERSAL')),
        item_id INTEGER NOT NULL,
        warehouse_id INTEGER NOT NULL,
        qty INTEGER NOT NULL CHECK(qty > 0),
        delta_qty INTEGER NOT NULL DEFAULT 0,
        ref_type TEXT,
        ref_id INTEGER,
        ref_no TEXT,
        unit_price REAL,
        source TEXT,
        target TEXT,
        remark TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
        created_by TEXT,
        FOREIGN KEY(item_id) REFERENCES items(id),
        FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_stock_tx_created_at ON stock_tx(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_stock_tx_item ON stock_tx(item_id)`,
      `CREATE INDEX IF NOT EXISTS idx_stock_tx_wh_created_at ON stock_tx(warehouse_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_stock_tx_item_created_at ON stock_tx(item_id, created_at)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_tx_ref_no_rid ON stock_tx(ref_no) WHERE ref_no LIKE 'rid:%'`,

      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin','operator','viewer')) DEFAULT 'admin',
        is_active INTEGER NOT NULL DEFAULT 1,
        must_change_password INTEGER NOT NULL DEFAULT 1,
        token_version INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,

      `CREATE TABLE IF NOT EXISTS auth_login_throttle (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        username TEXT NOT NULL,
        fail_count INTEGER NOT NULL DEFAULT 0,
        first_fail_at TEXT,
        last_fail_at TEXT,
        locked_until TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
        UNIQUE(ip, username)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_auth_login_throttle_locked ON auth_login_throttle(locked_until)`,

      `CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        action TEXT NOT NULL,
        entity TEXT,
        entity_id TEXT,
        payload_json TEXT,
        ip TEXT,
        ua TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity, entity_id)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_log_action_created_at ON audit_log(action, created_at)`,

      `CREATE TABLE IF NOT EXISTS audit_retention_state (
        id INTEGER PRIMARY KEY CHECK(id=1),
        retention_days INTEGER NOT NULL DEFAULT 180,
        last_cleanup_at TEXT
      )`,

      `CREATE TABLE IF NOT EXISTS stocktake (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        st_no TEXT NOT NULL UNIQUE,
        warehouse_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('DRAFT','APPLYING','APPLIED','ROLLING')) DEFAULT 'DRAFT',
        created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
        created_by TEXT,
        applied_at TEXT,
        FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_stocktake_created_at ON stocktake(created_at)`,
      `CREATE TABLE IF NOT EXISTS stocktake_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stocktake_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        system_qty INTEGER NOT NULL DEFAULT 0,
        counted_qty INTEGER,
        diff_qty INTEGER,
        updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
        UNIQUE(stocktake_id, item_id),
        FOREIGN KEY(stocktake_id) REFERENCES stocktake(id),
        FOREIGN KEY(item_id) REFERENCES items(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_stocktake_line_st ON stocktake_line(stocktake_id)`,

      `CREATE TABLE IF NOT EXISTS public_api_throttle (
        k TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
      )`,

      `CREATE TABLE IF NOT EXISTS api_slow_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
        method TEXT,
        path TEXT,
        query TEXT,
        status INTEGER,
        dur_ms INTEGER,
        auth_ms INTEGER,
        sql_ms INTEGER,
        colo TEXT,
        country TEXT,
        user_id INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS idx_api_slow_requests_created_at ON api_slow_requests(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_api_slow_requests_path ON api_slow_requests(path)`,
      `CREATE INDEX IF NOT EXISTS idx_api_slow_requests_dur ON api_slow_requests(dur_ms)`,

      `CREATE TABLE IF NOT EXISTS restore_job (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        stage TEXT NOT NULL,
        mode TEXT NOT NULL,
        file_key TEXT NOT NULL,
        filename TEXT,
        created_by TEXT,
        total_rows INTEGER NOT NULL DEFAULT 0,
        processed_rows INTEGER NOT NULL DEFAULT 0,
        current_table TEXT,
        cursor_json TEXT NOT NULL DEFAULT '{}',
        per_table_json TEXT NOT NULL DEFAULT '{}',
        replaced_done INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_restore_job_status ON restore_job(status)`,
    ];

    await db.batch(stmts.map((sql) => db.prepare(sql)));

    for (const ddl of [
      "ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1",
    ]) {
      await tryRun(db, ddl);
    }

    await tryRun(db, "INSERT OR IGNORE INTO warehouses (id, name) VALUES (2, '电脑仓')");
    await tryRun(db, "INSERT OR IGNORE INTO audit_retention_state (id, retention_days, last_cleanup_at) VALUES (1, 180, NULL)");
    __coreSchemaReady = true;
  })().finally(() => {
    __coreSchemaInit = null;
  });

  return __coreSchemaInit;
}
