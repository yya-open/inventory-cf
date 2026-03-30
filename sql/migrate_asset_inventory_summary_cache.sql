CREATE TABLE IF NOT EXISTS asset_inventory_summary_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  UNIQUE(kind, scope_key, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_asset_inventory_summary_cache_lookup
  ON asset_inventory_summary_cache(kind, scope_key, cache_key, updated_at);
