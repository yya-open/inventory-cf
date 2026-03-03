-- Add token_version for JWT immediate invalidation
-- Safe for repeated runs

ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
