PRAGMA foreign_keys = ON;

-- 1) stock_tx 增加 delta_qty（可正可负，用于审计）
-- 注意：老数据的 ADJUST/REVERSAL 无法可靠推断方向，默认保持 0；IN/OUT 会按 qty 自动补齐。
ALTER TABLE stock_tx ADD COLUMN delta_qty INTEGER NOT NULL DEFAULT 0;

UPDATE stock_tx
SET delta_qty =
  CASE type
    WHEN 'IN'  THEN qty
    WHEN 'OUT' THEN -qty
    ELSE 0
  END
WHERE delta_qty = 0 AND type IN ('IN','OUT');

-- 2) 登录限流/失败锁定表
CREATE TABLE IF NOT EXISTS auth_login_throttle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  username TEXT NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0,
  first_fail_at TEXT,
  last_fail_at TEXT,
  locked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ip, username)
);

CREATE INDEX IF NOT EXISTS idx_auth_login_throttle_locked ON auth_login_throttle(locked_until);
