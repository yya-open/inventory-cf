import { SQL_STORED_NOW_DEFAULT } from './_time';

// Core schema bootstrapper for non-PC warehouses.
// We avoid depending on filesystem SQL migrations at runtime.
// This is used by admin restore flows to auto-create missing tables/columns.

export async function ensureCoreSchema(db: D1Database) {
  const stmts: string[] = [
    "PRAGMA foreign_keys = ON",

    // Migration registry
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT}
    )`,
    "CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at)",

    // Warehouses
    `CREATE TABLE IF NOT EXISTS warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT}
    )`,

    // Items
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
      created_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT}
    )`,
    "CREATE INDEX IF NOT EXISTS idx_items_category ON items(category)",

    // Stock
    `CREATE TABLE IF NOT EXISTS stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      qty INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
      UNIQUE(item_id, warehouse_id),
      FOREIGN KEY(item_id) REFERENCES items(id),
      FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
    )`,
    "CREATE INDEX IF NOT EXISTS idx_stock_wh_item ON stock(warehouse_id, item_id)",

    // Stock transactions
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
      created_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
      created_by TEXT,
      FOREIGN KEY(item_id) REFERENCES items(id),
      FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
    )`,
    "CREATE INDEX IF NOT EXISTS idx_stock_tx_created_at ON stock_tx(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_stock_tx_item ON stock_tx(item_id)",
    "CREATE INDEX IF NOT EXISTS idx_stock_tx_wh_created_at ON stock_tx(warehouse_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_stock_tx_item_created_at ON stock_tx(item_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_stock_tx_type_created_at ON stock_tx(type, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_stock_tx_wh_type_created_at ON stock_tx(warehouse_id, type, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_stock_tx_ref_type_ref_id_item_wh ON stock_tx(ref_type, ref_id, item_id, warehouse_id)",
    // idempotency index (safe even if ref_no is null)
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_tx_ref_no_rid ON stock_tx(ref_no) WHERE ref_no LIKE 'rid:%'",

    // Users
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','operator','viewer')) DEFAULT 'admin',
      is_active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      token_version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT}
    )`,
    "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",

    // Login throttle
    `CREATE TABLE IF NOT EXISTS auth_login_throttle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      username TEXT NOT NULL,
      fail_count INTEGER NOT NULL DEFAULT 0,
      first_fail_at TEXT,
      last_fail_at TEXT,
      locked_until TEXT,
      updated_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
      UNIQUE(ip, username)
    )`,
    "CREATE INDEX IF NOT EXISTS idx_auth_login_throttle_locked ON auth_login_throttle(locked_until)",
    "CREATE INDEX IF NOT EXISTS idx_auth_login_throttle_ip_username_locked ON auth_login_throttle(ip, username, locked_until)",

    // Audit
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
      created_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT}
    )`,
    "CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity, entity_id)",
    "CREATE INDEX IF NOT EXISTS idx_audit_log_action_created_at ON audit_log(action, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_audit_log_username_created_at ON audit_log(username, created_at)",

    // Stocktake
    `CREATE TABLE IF NOT EXISTS stocktake (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      st_no TEXT NOT NULL UNIQUE,
      warehouse_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('DRAFT','APPLYING','APPLIED','ROLLING')) DEFAULT 'DRAFT',
      created_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
      created_by TEXT,
      applied_at TEXT,
      FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
    )`,
    "CREATE INDEX IF NOT EXISTS idx_stocktake_created_at ON stocktake(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_stocktake_wh_status_created_at ON stocktake(warehouse_id, status, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_stocktake_status_created_at ON stocktake(status, created_at)",
    `CREATE TABLE IF NOT EXISTS stocktake_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stocktake_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      system_qty INTEGER NOT NULL DEFAULT 0,
      counted_qty INTEGER,
      diff_qty INTEGER,
      updated_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
      UNIQUE(stocktake_id, item_id),
      FOREIGN KEY(stocktake_id) REFERENCES stocktake(id),
      FOREIGN KEY(item_id) REFERENCES items(id)
    )`,
    "CREATE INDEX IF NOT EXISTS idx_stocktake_line_st ON stocktake_line(stocktake_id)",
    "CREATE INDEX IF NOT EXISTS idx_stocktake_line_stocktake_counted ON stocktake_line(stocktake_id, counted_qty)",

    // Public API throttle (used by public QR pages)
    `CREATE TABLE IF NOT EXISTS public_api_throttle (
      k TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT}
    )`,
    "CREATE INDEX IF NOT EXISTS idx_public_api_throttle_updated_at ON public_api_throttle(updated_at)",

    // System settings
    `CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
      updated_by TEXT
    )`,
    "CREATE INDEX IF NOT EXISTS idx_system_settings_updated_at ON system_settings(updated_at)",

    // Restore jobs (admin progress restore)
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
      snapshot_key TEXT,
      snapshot_status TEXT,
      snapshot_filename TEXT,
      snapshot_created_at TEXT,
      restore_points_json TEXT NOT NULL DEFAULT '[]',
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
      updated_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT}
    )`,
    "CREATE INDEX IF NOT EXISTS idx_restore_job_status ON restore_job(status)",
  ];

  // Best-effort execute.
  await db.batch(stmts.map((sql) => db.prepare(sql)));

  // Backfill/upgrade columns for older installs.
  // Some early versions didn't have token_version.
  try {
    const cols = await db.prepare("PRAGMA table_info(users)").all<any>();
    const names = new Set((cols?.results || []).map((r: any) => String(r?.name || '').trim()));
    if (!names.has("token_version")) {
      await db.prepare("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0").run();
    }
    if (!names.has("must_change_password")) {
      await db.prepare("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1").run();
    }
  } catch {
    // ignore
  }

  try {
    await db.prepare("ALTER TABLE restore_job ADD COLUMN snapshot_key TEXT").run();
  } catch {}
  try {
    await db.prepare("ALTER TABLE restore_job ADD COLUMN snapshot_status TEXT").run();
  } catch {}
  try {
    await db.prepare("ALTER TABLE restore_job ADD COLUMN snapshot_filename TEXT").run();
  } catch {}
  try {
    await db.prepare("ALTER TABLE restore_job ADD COLUMN snapshot_created_at TEXT").run();
  } catch {}
  try {
    await db.prepare("ALTER TABLE restore_job ADD COLUMN restore_points_json TEXT NOT NULL DEFAULT '[]'").run();
  } catch {}
  try {
    await db.prepare("ALTER TABLE restore_job ADD COLUMN completed_at TEXT").run();
  } catch {}


  // Ensure warehouse '电脑仓' exists (id=2) to keep existing PC logic stable.
  try {
    await db.prepare("INSERT OR IGNORE INTO warehouses (id, name) VALUES (2, '电脑仓')").run();
  } catch {
    // ignore
  }
}
