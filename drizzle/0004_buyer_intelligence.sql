CREATE TABLE buyer_profiles (
  visitor TEXT PRIMARY KEY,
  preferences_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX buyer_profiles_updated ON buyer_profiles(updated_at DESC);
