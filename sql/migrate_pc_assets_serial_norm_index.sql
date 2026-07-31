-- 批量入库/出库/回收都用 UPPER(TRIM(serial_no)) 归一化后匹配序列号
-- (functions/api/services/batch-utils.ts: batchFindAssetsBySerial,
--  functions/api/services/asset-write.ts: getPcAssetByNormalizedSerial,
--  functions/api/pc-in-batch.ts 的 asset_id 子查询)。
-- idx_pc_assets_serial 建在裸列上,无法服务这些表达式谓词,每次导入都要全表扫描。
-- UPPER / TRIM 都是确定性函数,可以直接建表达式索引。
CREATE INDEX IF NOT EXISTS idx_pc_assets_serial_norm
ON pc_assets(UPPER(TRIM(serial_no)));
