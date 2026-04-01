CREATE VIRTUAL TABLE IF NOT EXISTS pc_assets_fts USING fts5(
  serial_no,
  brand,
  model,
  remark,
  disk_capacity,
  memory_size,
  search_text_norm,
  tokenize='unicode61 remove_diacritics 2',
  prefix='2 3 4 5 6'
);

CREATE VIRTUAL TABLE IF NOT EXISTS monitor_assets_fts USING fts5(
  asset_code,
  sn,
  brand,
  model,
  size_inch,
  employee_no,
  employee_name,
  department,
  remark,
  search_text_norm,
  tokenize='unicode61 remove_diacritics 2',
  prefix='2 3 4 5 6'
);

CREATE VIRTUAL TABLE IF NOT EXISTS audit_log_fts USING fts5(
  username,
  action,
  entity,
  entity_id,
  target_name,
  target_code,
  summary_text,
  search_text_norm,
  tokenize='unicode61 remove_diacritics 2',
  prefix='2 3 4 5 6'
);

CREATE TRIGGER IF NOT EXISTS pc_assets_fts_ai AFTER INSERT ON pc_assets BEGIN
  INSERT INTO pc_assets_fts(rowid, serial_no, brand, model, remark, disk_capacity, memory_size, search_text_norm)
  VALUES (new.id, COALESCE(new.serial_no,''), COALESCE(new.brand,''), COALESCE(new.model,''), COALESCE(new.remark,''), COALESCE(new.disk_capacity,''), COALESCE(new.memory_size,''), COALESCE(new.search_text_norm,''));
END;

CREATE TRIGGER IF NOT EXISTS pc_assets_fts_au AFTER UPDATE ON pc_assets BEGIN
  DELETE FROM pc_assets_fts WHERE rowid = old.id;
  INSERT INTO pc_assets_fts(rowid, serial_no, brand, model, remark, disk_capacity, memory_size, search_text_norm)
  VALUES (new.id, COALESCE(new.serial_no,''), COALESCE(new.brand,''), COALESCE(new.model,''), COALESCE(new.remark,''), COALESCE(new.disk_capacity,''), COALESCE(new.memory_size,''), COALESCE(new.search_text_norm,''));
END;

CREATE TRIGGER IF NOT EXISTS pc_assets_fts_ad AFTER DELETE ON pc_assets BEGIN
  DELETE FROM pc_assets_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS monitor_assets_fts_ai AFTER INSERT ON monitor_assets BEGIN
  INSERT INTO monitor_assets_fts(rowid, asset_code, sn, brand, model, size_inch, employee_no, employee_name, department, remark, search_text_norm)
  VALUES (new.id, COALESCE(new.asset_code,''), COALESCE(new.sn,''), COALESCE(new.brand,''), COALESCE(new.model,''), COALESCE(new.size_inch,''), COALESCE(new.employee_no,''), COALESCE(new.employee_name,''), COALESCE(new.department,''), COALESCE(new.remark,''), COALESCE(new.search_text_norm,''));
END;

CREATE TRIGGER IF NOT EXISTS monitor_assets_fts_au AFTER UPDATE ON monitor_assets BEGIN
  DELETE FROM monitor_assets_fts WHERE rowid = old.id;
  INSERT INTO monitor_assets_fts(rowid, asset_code, sn, brand, model, size_inch, employee_no, employee_name, department, remark, search_text_norm)
  VALUES (new.id, COALESCE(new.asset_code,''), COALESCE(new.sn,''), COALESCE(new.brand,''), COALESCE(new.model,''), COALESCE(new.size_inch,''), COALESCE(new.employee_no,''), COALESCE(new.employee_name,''), COALESCE(new.department,''), COALESCE(new.remark,''), COALESCE(new.search_text_norm,''));
END;

CREATE TRIGGER IF NOT EXISTS monitor_assets_fts_ad AFTER DELETE ON monitor_assets BEGIN
  DELETE FROM monitor_assets_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS audit_log_fts_ai AFTER INSERT ON audit_log BEGIN
  INSERT INTO audit_log_fts(rowid, username, action, entity, entity_id, target_name, target_code, summary_text, search_text_norm)
  VALUES (new.id, COALESCE(new.username,''), COALESCE(new.action,''), COALESCE(new.entity,''), COALESCE(new.entity_id,''), COALESCE(new.target_name,''), COALESCE(new.target_code,''), COALESCE(new.summary_text,''), COALESCE(new.search_text_norm,''));
END;

CREATE TRIGGER IF NOT EXISTS audit_log_fts_au AFTER UPDATE ON audit_log BEGIN
  DELETE FROM audit_log_fts WHERE rowid = old.id;
  INSERT INTO audit_log_fts(rowid, username, action, entity, entity_id, target_name, target_code, summary_text, search_text_norm)
  VALUES (new.id, COALESCE(new.username,''), COALESCE(new.action,''), COALESCE(new.entity,''), COALESCE(new.entity_id,''), COALESCE(new.target_name,''), COALESCE(new.target_code,''), COALESCE(new.summary_text,''), COALESCE(new.search_text_norm,''));
END;

CREATE TRIGGER IF NOT EXISTS audit_log_fts_ad AFTER DELETE ON audit_log BEGIN
  DELETE FROM audit_log_fts WHERE rowid = old.id;
END;

DELETE FROM pc_assets_fts;
INSERT INTO pc_assets_fts(rowid, serial_no, brand, model, remark, disk_capacity, memory_size, search_text_norm)
SELECT id, COALESCE(serial_no,''), COALESCE(brand,''), COALESCE(model,''), COALESCE(remark,''), COALESCE(disk_capacity,''), COALESCE(memory_size,''), COALESCE(search_text_norm,'')
FROM pc_assets;

DELETE FROM monitor_assets_fts;
INSERT INTO monitor_assets_fts(rowid, asset_code, sn, brand, model, size_inch, employee_no, employee_name, department, remark, search_text_norm)
SELECT id, COALESCE(asset_code,''), COALESCE(sn,''), COALESCE(brand,''), COALESCE(model,''), COALESCE(size_inch,''), COALESCE(employee_no,''), COALESCE(employee_name,''), COALESCE(department,''), COALESCE(remark,''), COALESCE(search_text_norm,'')
FROM monitor_assets;

DELETE FROM audit_log_fts;
INSERT INTO audit_log_fts(rowid, username, action, entity, entity_id, target_name, target_code, summary_text, search_text_norm)
SELECT id, COALESCE(username,''), COALESCE(action,''), COALESCE(entity,''), COALESCE(entity_id,''), COALESCE(target_name,''), COALESCE(target_code,''), COALESCE(summary_text,''), COALESCE(search_text_norm,'')
FROM audit_log;

CREATE TABLE IF NOT EXISTS dictionary_usage_dirty_keys (
  dictionary_key TEXT PRIMARY KEY,
  dirty_since TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  refresh_after TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_dictionary_usage_dirty_refresh_after
  ON dictionary_usage_dirty_keys(refresh_after, dirty_since);
