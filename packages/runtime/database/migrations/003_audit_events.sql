CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  category TEXT NOT NULL,
  action TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  actor_type TEXT,
  actor_id TEXT,
  subject_type TEXT,
  subject_id TEXT,
  correlation_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at
  ON audit_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_category_action
  ON audit_events(category, action);
CREATE INDEX IF NOT EXISTS idx_audit_events_subject
  ON audit_events(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_correlation
  ON audit_events(correlation_id);
