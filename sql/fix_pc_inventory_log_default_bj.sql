PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS pc_inventory_log__bjtmp;

CREATE TABLE pc_inventory_log__bjtmp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  issue_type TEXT,
  remark TEXT,
  ip TEXT,
  ua TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  FOREIGN KEY(asset_id) REFERENCES pc_assets(id) ON DELETE CASCADE
);

INSERT INTO pc_inventory_log__bjtmp (id,asset_id,action,issue_type,remark,ip,ua,created_at)
SELECT id,asset_id,action,issue_type,remark,ip,ua,created_at
FROM pc_inventory_log;

DROP TABLE pc_inventory_log;
ALTER TABLE pc_inventory_log__bjtmp RENAME TO pc_inventory_log;

DELETE FROM sqlite_sequence WHERE name='pc_inventory_log';
INSERT INTO sqlite_sequence(name, seq)
VALUES('pc_inventory_log', COALESCE((SELECT MAX(id) FROM pc_inventory_log), 0));

PRAGMA foreign_keys=ON;