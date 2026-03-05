PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS public_api_throttle__bjtmp;

CREATE TABLE public_api_throttle__bjtmp (
  k TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);

INSERT INTO public_api_throttle__bjtmp(k, count, updated_at)
SELECT k, count, updated_at FROM public_api_throttle;

DROP TABLE public_api_throttle;
ALTER TABLE public_api_throttle__bjtmp RENAME TO public_api_throttle;

PRAGMA foreign_keys=ON;