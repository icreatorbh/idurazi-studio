CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed','cancelled')),
  payload TEXT NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  available_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  lease_owner TEXT,
  lease_expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_claim
  ON jobs(status, available_at, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_jobs_lease
  ON jobs(status, lease_expires_at);
