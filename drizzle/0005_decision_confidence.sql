CREATE TABLE buyer_interactions (
  id TEXT PRIMARY KEY,
  visitor TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('saved','unsaved','compared','enquired')),
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX buyer_interactions_visitor ON buyer_interactions(visitor,created_at DESC);
--> statement-breakpoint
ALTER TABLE dealers ADD COLUMN response_quality TEXT NOT NULL DEFAULT 'unrated' CHECK(response_quality IN ('unrated','responsive','slow'));
--> statement-breakpoint
ALTER TABLE dealers ADD COLUMN typical_response_hours INTEGER;
