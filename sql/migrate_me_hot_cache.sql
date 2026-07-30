-- /api/auth/me 的热路径缓存表。此前只靠请求路径上的运行时 DDL 建出，
-- 这里改为显式迁移。纯缓存数据，不纳入备份清单，丢失后由下次请求重建。
CREATE TABLE IF NOT EXISTS me_hot_cache (
  user_id INTEGER PRIMARY KEY,
  payload_json TEXT NOT NULL,
  acl_version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);
