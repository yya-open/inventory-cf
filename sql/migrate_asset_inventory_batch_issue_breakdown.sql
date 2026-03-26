ALTER TABLE asset_inventory_batch ADD COLUMN summary_issue_breakdown TEXT;

UPDATE asset_inventory_batch
SET summary_issue_breakdown = json_object(
  'NOT_FOUND', COALESCE((SELECT COUNT(1) FROM pc_inventory_log l WHERE l.batch_id = asset_inventory_batch.id AND UPPER(COALESCE(l.action,''))='ISSUE' AND UPPER(COALESCE(l.issue_type,''))='NOT_FOUND'), 0),
  'WRONG_LOCATION', COALESCE((SELECT COUNT(1) FROM pc_inventory_log l WHERE l.batch_id = asset_inventory_batch.id AND UPPER(COALESCE(l.action,''))='ISSUE' AND UPPER(COALESCE(l.issue_type,''))='WRONG_LOCATION'), 0),
  'WRONG_QR', COALESCE((SELECT COUNT(1) FROM pc_inventory_log l WHERE l.batch_id = asset_inventory_batch.id AND UPPER(COALESCE(l.action,''))='ISSUE' AND UPPER(COALESCE(l.issue_type,''))='WRONG_QR'), 0),
  'WRONG_STATUS', COALESCE((SELECT COUNT(1) FROM pc_inventory_log l WHERE l.batch_id = asset_inventory_batch.id AND UPPER(COALESCE(l.action,''))='ISSUE' AND UPPER(COALESCE(l.issue_type,''))='WRONG_STATUS'), 0),
  'MISSING', COALESCE((SELECT COUNT(1) FROM pc_inventory_log l WHERE l.batch_id = asset_inventory_batch.id AND UPPER(COALESCE(l.action,''))='ISSUE' AND UPPER(COALESCE(l.issue_type,''))='MISSING'), 0),
  'OTHER', COALESCE((SELECT COUNT(1) FROM pc_inventory_log l WHERE l.batch_id = asset_inventory_batch.id AND UPPER(COALESCE(l.action,''))='ISSUE' AND UPPER(COALESCE(l.issue_type,''))='OTHER'), 0)
)
WHERE kind='pc';

UPDATE asset_inventory_batch
SET summary_issue_breakdown = json_object(
  'NOT_FOUND', COALESCE((SELECT COUNT(1) FROM monitor_inventory_log l WHERE l.batch_id = asset_inventory_batch.id AND UPPER(COALESCE(l.action,''))='ISSUE' AND UPPER(COALESCE(l.issue_type,''))='NOT_FOUND'), 0),
  'WRONG_LOCATION', COALESCE((SELECT COUNT(1) FROM monitor_inventory_log l WHERE l.batch_id = asset_inventory_batch.id AND UPPER(COALESCE(l.action,''))='ISSUE' AND UPPER(COALESCE(l.issue_type,''))='WRONG_LOCATION'), 0),
  'WRONG_QR', COALESCE((SELECT COUNT(1) FROM monitor_inventory_log l WHERE l.batch_id = asset_inventory_batch.id AND UPPER(COALESCE(l.action,''))='ISSUE' AND UPPER(COALESCE(l.issue_type,''))='WRONG_QR'), 0),
  'WRONG_STATUS', COALESCE((SELECT COUNT(1) FROM monitor_inventory_log l WHERE l.batch_id = asset_inventory_batch.id AND UPPER(COALESCE(l.action,''))='ISSUE' AND UPPER(COALESCE(l.issue_type,''))='WRONG_STATUS'), 0),
  'MISSING', COALESCE((SELECT COUNT(1) FROM monitor_inventory_log l WHERE l.batch_id = asset_inventory_batch.id AND UPPER(COALESCE(l.action,''))='ISSUE' AND UPPER(COALESCE(l.issue_type,''))='MISSING'), 0),
  'OTHER', COALESCE((SELECT COUNT(1) FROM monitor_inventory_log l WHERE l.batch_id = asset_inventory_batch.id AND UPPER(COALESCE(l.action,''))='ISSUE' AND UPPER(COALESCE(l.issue_type,''))='OTHER'), 0)
)
WHERE kind='monitor';
