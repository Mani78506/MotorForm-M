CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX rate_limits_window ON rate_limits(window_started_at);
