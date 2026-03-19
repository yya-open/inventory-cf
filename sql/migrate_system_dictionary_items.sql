CREATE TABLE IF NOT EXISTS system_dictionary_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dictionary_key TEXT NOT NULL,
  label TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  updated_by TEXT,
  UNIQUE(dictionary_key, normalized_label)
);

CREATE INDEX IF NOT EXISTS idx_system_dictionary_items_key_sort
  ON system_dictionary_items(dictionary_key, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_system_dictionary_items_key_enabled
  ON system_dictionary_items(dictionary_key, enabled, sort_order, id);
