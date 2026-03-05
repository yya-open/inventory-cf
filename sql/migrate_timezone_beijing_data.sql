PRAGMA foreign_keys = OFF;

-- Convert existing UTC timestamps stored as 'YYYY-MM-DD HH:MM:SS' to Beijing time (UTC+8).
-- Run ONCE. If your UI already added +8 on display, do NOT run this.

-- Core tables
UPDATE warehouses SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL;
UPDATE items      SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL;
UPDATE users      SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL;

UPDATE stock      SET updated_at = datetime(updated_at, '+8 hours') WHERE updated_at IS NOT NULL;
UPDATE stock_tx   SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL;

UPDATE audit_log  SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL;

UPDATE auth_login_throttle
SET first_fail_at = CASE WHEN first_fail_at IS NULL THEN NULL ELSE datetime(first_fail_at, '+8 hours') END,
    last_fail_at  = CASE WHEN last_fail_at  IS NULL THEN NULL ELSE datetime(last_fail_at,  '+8 hours') END,
    locked_until  = CASE WHEN locked_until  IS NULL THEN NULL ELSE datetime(locked_until,  '+8 hours') END,
    updated_at    = CASE WHEN updated_at    IS NULL THEN NULL ELSE datetime(updated_at,    '+8 hours') END;

-- PC asset tables
UPDATE pc_assets
SET created_at    = datetime(created_at, '+8 hours'),
    updated_at    = datetime(updated_at, '+8 hours'),
    qr_updated_at = CASE WHEN qr_updated_at IS NULL THEN NULL ELSE datetime(qr_updated_at, '+8 hours') END
WHERE created_at IS NOT NULL OR updated_at IS NOT NULL OR qr_updated_at IS NOT NULL;

UPDATE pc_in   SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL;
UPDATE pc_out  SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL;
UPDATE pc_scrap SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL;

-- Stocktake
UPDATE stocktake
SET created_at = datetime(created_at, '+8 hours'),
    applied_at = CASE WHEN applied_at IS NULL THEN NULL ELSE datetime(applied_at, '+8 hours') END
WHERE created_at IS NOT NULL OR applied_at IS NOT NULL;

UPDATE stocktake_line SET updated_at = datetime(updated_at, '+8 hours') WHERE updated_at IS NOT NULL;

-- Restore job / perf logging
UPDATE restore_job
SET created_at = datetime(created_at, '+8 hours'),
    updated_at = datetime(updated_at, '+8 hours')
WHERE created_at IS NOT NULL OR updated_at IS NOT NULL;

UPDATE api_slow_requests SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL;

-- Public QR throttle + inventory log (new feature)
UPDATE public_api_throttle SET updated_at = datetime(updated_at, '+8 hours') WHERE updated_at IS NOT NULL;
UPDATE pc_inventory_log    SET created_at = datetime(created_at, '+8 hours') WHERE created_at IS NOT NULL;

PRAGMA foreign_keys = ON;
