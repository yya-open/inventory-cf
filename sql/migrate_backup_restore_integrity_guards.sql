PRAGMA foreign_keys = ON;

DROP TRIGGER IF EXISTS trg_users_username_non_blank_insert;
CREATE TRIGGER trg_users_username_non_blank_insert
BEFORE INSERT ON users
FOR EACH ROW
WHEN TRIM(COALESCE(NEW.username, '')) = ''
BEGIN
  SELECT RAISE(ABORT, 'username 不能为空');
END;

DROP TRIGGER IF EXISTS trg_users_username_non_blank_update;
CREATE TRIGGER trg_users_username_non_blank_update
BEFORE UPDATE OF username ON users
FOR EACH ROW
WHEN TRIM(COALESCE(NEW.username, '')) = ''
BEGIN
  SELECT RAISE(ABORT, 'username 不能为空');
END;

DROP TRIGGER IF EXISTS trg_users_data_scope_valid_insert;
CREATE TRIGGER trg_users_data_scope_valid_insert
BEFORE INSERT ON users
FOR EACH ROW
WHEN NOT (
  (LOWER(TRIM(COALESCE(NEW.data_scope_type, 'all'))) = 'all' AND TRIM(COALESCE(NEW.data_scope_value, '')) = '' AND TRIM(COALESCE(NEW.data_scope_value2, '')) = '') OR
  (LOWER(TRIM(COALESCE(NEW.data_scope_type, 'all'))) = 'department' AND TRIM(COALESCE(NEW.data_scope_value, '')) <> '' AND TRIM(COALESCE(NEW.data_scope_value2, '')) = '') OR
  (LOWER(TRIM(COALESCE(NEW.data_scope_type, 'all'))) = 'warehouse' AND TRIM(COALESCE(NEW.data_scope_value, '')) <> '' AND TRIM(COALESCE(NEW.data_scope_value2, '')) = '') OR
  (LOWER(TRIM(COALESCE(NEW.data_scope_type, 'all'))) = 'department_warehouse' AND TRIM(COALESCE(NEW.data_scope_value, '')) <> '' AND TRIM(COALESCE(NEW.data_scope_value2, '')) <> '')
)
BEGIN
  SELECT RAISE(ABORT, '非法的数据范围配置');
END;

DROP TRIGGER IF EXISTS trg_users_data_scope_valid_update;
CREATE TRIGGER trg_users_data_scope_valid_update
BEFORE UPDATE OF data_scope_type, data_scope_value, data_scope_value2 ON users
FOR EACH ROW
WHEN NOT (
  (LOWER(TRIM(COALESCE(NEW.data_scope_type, 'all'))) = 'all' AND TRIM(COALESCE(NEW.data_scope_value, '')) = '' AND TRIM(COALESCE(NEW.data_scope_value2, '')) = '') OR
  (LOWER(TRIM(COALESCE(NEW.data_scope_type, 'all'))) = 'department' AND TRIM(COALESCE(NEW.data_scope_value, '')) <> '' AND TRIM(COALESCE(NEW.data_scope_value2, '')) = '') OR
  (LOWER(TRIM(COALESCE(NEW.data_scope_type, 'all'))) = 'warehouse' AND TRIM(COALESCE(NEW.data_scope_value, '')) <> '' AND TRIM(COALESCE(NEW.data_scope_value2, '')) = '') OR
  (LOWER(TRIM(COALESCE(NEW.data_scope_type, 'all'))) = 'department_warehouse' AND TRIM(COALESCE(NEW.data_scope_value, '')) <> '' AND TRIM(COALESCE(NEW.data_scope_value2, '')) <> '')
)
BEGIN
  SELECT RAISE(ABORT, '非法的数据范围配置');
END;

DROP TRIGGER IF EXISTS trg_stock_qty_non_negative_insert;
CREATE TRIGGER trg_stock_qty_non_negative_insert
BEFORE INSERT ON stock
FOR EACH ROW
WHEN COALESCE(NEW.qty, 0) < 0
BEGIN
  SELECT RAISE(ABORT, '库存数量不能小于 0');
END;

DROP TRIGGER IF EXISTS trg_stock_qty_non_negative_update;
CREATE TRIGGER trg_stock_qty_non_negative_update
BEFORE UPDATE OF qty ON stock
FOR EACH ROW
WHEN COALESCE(NEW.qty, 0) < 0
BEGIN
  SELECT RAISE(ABORT, '库存数量不能小于 0');
END;

DROP TRIGGER IF EXISTS trg_pc_assets_serial_non_blank_insert;
CREATE TRIGGER trg_pc_assets_serial_non_blank_insert
BEFORE INSERT ON pc_assets
FOR EACH ROW
WHEN TRIM(COALESCE(NEW.serial_no, '')) = ''
BEGIN
  SELECT RAISE(ABORT, '电脑序列号不能为空');
END;

DROP TRIGGER IF EXISTS trg_pc_assets_serial_non_blank_update;
CREATE TRIGGER trg_pc_assets_serial_non_blank_update
BEFORE UPDATE OF serial_no ON pc_assets
FOR EACH ROW
WHEN TRIM(COALESCE(NEW.serial_no, '')) = ''
BEGIN
  SELECT RAISE(ABORT, '电脑序列号不能为空');
END;

DROP TRIGGER IF EXISTS trg_monitor_assets_code_non_blank_insert;
CREATE TRIGGER trg_monitor_assets_code_non_blank_insert
BEFORE INSERT ON monitor_assets
FOR EACH ROW
WHEN TRIM(COALESCE(NEW.asset_code, '')) = ''
BEGIN
  SELECT RAISE(ABORT, '显示器资产编码不能为空');
END;

DROP TRIGGER IF EXISTS trg_monitor_assets_code_non_blank_update;
CREATE TRIGGER trg_monitor_assets_code_non_blank_update
BEFORE UPDATE OF asset_code ON monitor_assets
FOR EACH ROW
WHEN TRIM(COALESCE(NEW.asset_code, '')) = ''
BEGIN
  SELECT RAISE(ABORT, '显示器资产编码不能为空');
END;
