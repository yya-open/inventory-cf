-- Timezone table rebuilds can remove this index. Keep cleanup queries indexed
-- without relying on runtime DDL in public request handlers.
CREATE INDEX IF NOT EXISTS idx_public_api_throttle_updated_at
  ON public_api_throttle(updated_at);
