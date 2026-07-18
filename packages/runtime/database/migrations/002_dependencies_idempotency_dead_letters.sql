ALTER TABLE jobs ADD COLUMN idempotency_key TEXT;
ALTER TABLE jobs ADD COLUMN dead_lettered_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idempotency_key
  ON jobs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS job_dependencies (
  job_id TEXT NOT NULL,
  depends_on_job_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (job_id, depends_on_job_id),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CHECK (job_id <> depends_on_job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_dependencies_job
  ON job_dependencies(job_id);

CREATE INDEX IF NOT EXISTS idx_job_dependencies_parent
  ON job_dependencies(depends_on_job_id);

CREATE TABLE IF NOT EXISTS dead_letters (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  error TEXT,
  attempts INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  replayed_at TEXT,
  replay_job_id TEXT,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (replay_job_id) REFERENCES jobs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_dead_letters_created
  ON dead_letters(created_at DESC);
