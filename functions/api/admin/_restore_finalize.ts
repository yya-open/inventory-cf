export async function rebuildPcAssetState(db: D1Database) {
  await db.prepare(`
    UPDATE pc_assets
    SET status = CASE
      WHEN EXISTS (SELECT 1 FROM pc_scrap s WHERE s.asset_id = pc_assets.id) THEN 'SCRAPPED'
      WHEN EXISTS (
        SELECT 1 FROM pc_out o
        WHERE o.asset_id = pc_assets.id
          AND NOT EXISTS (
            SELECT 1 FROM pc_recycle r
            WHERE r.asset_id = pc_assets.id AND COALESCE(r.id, 0) > COALESCE(o.id, 0)
          )
      ) THEN 'ASSIGNED'
      WHEN EXISTS (SELECT 1 FROM pc_recycle r WHERE r.asset_id = pc_assets.id) THEN 'RECYCLED'
      ELSE 'IN_STOCK'
    END,
    updated_at = datetime('now','+8 hours')
  `).run();
}

export async function rebuildMonitorAssetState(db: D1Database) {
  await db.prepare(`
    UPDATE monitor_assets
    SET status = COALESCE((
      SELECT CASE tx.tx_type
        WHEN 'OUT' THEN 'ASSIGNED'
        WHEN 'TRANSFER' THEN 'ASSIGNED'
        WHEN 'IN' THEN 'IN_STOCK'
        WHEN 'RETURN' THEN 'IN_STOCK'
        WHEN 'SCRAP' THEN 'SCRAPPED'
        WHEN 'ADJUST' THEN monitor_assets.status
        ELSE monitor_assets.status
      END
      FROM monitor_tx tx
      WHERE tx.asset_id = monitor_assets.id
      ORDER BY tx.id DESC
      LIMIT 1
    ), status),
    location_id = COALESCE((
      SELECT CASE
        WHEN tx.tx_type IN ('OUT','TRANSFER') THEN tx.to_location_id
        WHEN tx.tx_type IN ('IN','RETURN') THEN tx.to_location_id
        ELSE monitor_assets.location_id
      END
      FROM monitor_tx tx
      WHERE tx.asset_id = monitor_assets.id
      ORDER BY tx.id DESC
      LIMIT 1
    ), location_id),
    employee_no = CASE
      WHEN COALESCE((SELECT tx.tx_type FROM monitor_tx tx WHERE tx.asset_id = monitor_assets.id ORDER BY tx.id DESC LIMIT 1), '') IN ('OUT','TRANSFER')
        THEN COALESCE((SELECT tx.employee_no FROM monitor_tx tx WHERE tx.asset_id = monitor_assets.id ORDER BY tx.id DESC LIMIT 1), employee_no)
      WHEN COALESCE((SELECT tx.tx_type FROM monitor_tx tx WHERE tx.asset_id = monitor_assets.id ORDER BY tx.id DESC LIMIT 1), '') IN ('IN','RETURN','SCRAP')
        THEN NULL
      ELSE employee_no
    END,
    department = CASE
      WHEN COALESCE((SELECT tx.tx_type FROM monitor_tx tx WHERE tx.asset_id = monitor_assets.id ORDER BY tx.id DESC LIMIT 1), '') IN ('OUT','TRANSFER')
        THEN COALESCE((SELECT tx.department FROM monitor_tx tx WHERE tx.asset_id = monitor_assets.id ORDER BY tx.id DESC LIMIT 1), department)
      WHEN COALESCE((SELECT tx.tx_type FROM monitor_tx tx WHERE tx.asset_id = monitor_assets.id ORDER BY tx.id DESC LIMIT 1), '') IN ('IN','RETURN','SCRAP')
        THEN NULL
      ELSE department
    END,
    employee_name = CASE
      WHEN COALESCE((SELECT tx.tx_type FROM monitor_tx tx WHERE tx.asset_id = monitor_assets.id ORDER BY tx.id DESC LIMIT 1), '') IN ('OUT','TRANSFER')
        THEN COALESCE((SELECT tx.employee_name FROM monitor_tx tx WHERE tx.asset_id = monitor_assets.id ORDER BY tx.id DESC LIMIT 1), employee_name)
      WHEN COALESCE((SELECT tx.tx_type FROM monitor_tx tx WHERE tx.asset_id = monitor_assets.id ORDER BY tx.id DESC LIMIT 1), '') IN ('IN','RETURN','SCRAP')
        THEN NULL
      ELSE employee_name
    END,
    is_employed = CASE
      WHEN COALESCE((SELECT tx.tx_type FROM monitor_tx tx WHERE tx.asset_id = monitor_assets.id ORDER BY tx.id DESC LIMIT 1), '') IN ('OUT','TRANSFER')
        THEN COALESCE((SELECT tx.is_employed FROM monitor_tx tx WHERE tx.asset_id = monitor_assets.id ORDER BY tx.id DESC LIMIT 1), is_employed)
      WHEN COALESCE((SELECT tx.tx_type FROM monitor_tx tx WHERE tx.asset_id = monitor_assets.id ORDER BY tx.id DESC LIMIT 1), '') IN ('IN','RETURN','SCRAP')
        THEN NULL
      ELSE is_employed
    END,
    updated_at = datetime('now','+8 hours')
  `).run();
}

export async function finalizeRestore(db: D1Database) {
  await rebuildPcAssetState(db);
  await rebuildMonitorAssetState(db);
}
