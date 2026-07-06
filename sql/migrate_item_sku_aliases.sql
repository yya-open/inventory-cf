CREATE TABLE IF NOT EXISTS item_sku_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  alias_sku TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  created_by TEXT,
  note TEXT,
  FOREIGN KEY(item_id) REFERENCES items(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_sku_aliases_alias_active
  ON item_sku_aliases(alias_sku)
  WHERE active=1;

CREATE INDEX IF NOT EXISTS idx_item_sku_aliases_item_active
  ON item_sku_aliases(item_id, active);
