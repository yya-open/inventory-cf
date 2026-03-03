-- 可控长期二维码：为每台电脑生成一个可撤销的 qr_key
-- 说明：
-- 1) 二维码里将包含 id + qr_key（不会因为更换 JWT_SECRET 失效）
-- 2) 管理员可“重置二维码”，会生成新 qr_key，旧二维码立即作废
-- 3) 不影响已有数据；qr_key 为空时会在第一次生成二维码时自动补齐

ALTER TABLE pc_assets ADD COLUMN qr_key TEXT;
ALTER TABLE pc_assets ADD COLUMN qr_updated_at TEXT;
