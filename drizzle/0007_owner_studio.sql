CREATE TABLE owner_requests (
  id TEXT PRIMARY KEY,
  visitor TEXT NOT NULL,
  package_id TEXT NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  variant TEXT NOT NULL,
  items_json TEXT NOT NULL,
  estimated_total INTEGER NOT NULL,
  no_wiring_cuts INTEGER NOT NULL DEFAULT 0,
  email TEXT NOT NULL,
  city_id TEXT NOT NULL REFERENCES cities(id),
  status TEXT NOT NULL DEFAULT 'received',
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX owner_requests_visitor ON owner_requests(visitor,created_at DESC);
