-- Add acl_version for /api/auth/me cache version check
-- Safe with migration runner skip logic when column already exists

ALTER TABLE users ADD COLUMN acl_version INTEGER NOT NULL DEFAULT 0;
