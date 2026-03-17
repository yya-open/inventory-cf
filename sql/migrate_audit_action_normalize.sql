-- Normalize historical audit action names to uppercase snake case.
-- New writes are also normalized at runtime in functions/api/_audit.ts.

UPDATE audit_log SET action='MONITOR_ASSET_CREATE' WHERE action='monitor_asset_create';
UPDATE audit_log SET action='MONITOR_ASSET_UPDATE' WHERE action='monitor_asset_update';
UPDATE audit_log SET action='MONITOR_ASSET_DELETE' WHERE action='monitor_asset_delete';
UPDATE audit_log SET action='MONITOR_SCHEMA_INIT' WHERE action='monitor_schema_init';
UPDATE audit_log SET action='PC_LOCATION_CREATE' WHERE action='pc_location_create';
UPDATE audit_log SET action='PC_LOCATION_UPDATE' WHERE action='pc_location_update';
UPDATE audit_log SET action='PC_LOCATION_DELETE' WHERE action='pc_location_delete';
UPDATE audit_log SET action='PC_ASSET_UPDATE' WHERE action='pc_asset_update';
UPDATE audit_log SET action='PC_ASSET_DELETE' WHERE action='pc_asset_delete';
UPDATE audit_log SET action='MONITOR_INVENTORY_LOG_DELETE' WHERE action='monitor_inventory_log_delete';
UPDATE audit_log SET action='MONITOR_INVENTORY_LOG_EXPORT' WHERE action='monitor_inventory_log_export';
UPDATE audit_log SET action='MONITOR_TX_EXPORT' WHERE action='monitor_tx_export';
UPDATE audit_log SET action='PC_INVENTORY_LOG_DELETE' WHERE action='pc_inventory_log_delete';
UPDATE audit_log SET action='PC_INVENTORY_LOG_EXPORT' WHERE action='pc_inventory_log_export';
UPDATE audit_log SET action='ADMIN_INIT_SCHEMA' WHERE action='admin.init_schema';
