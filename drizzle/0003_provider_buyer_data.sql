CREATE TABLE saved_vehicles (
  visitor TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (visitor,vehicle_id,provider_id)
);
--> statement-breakpoint
ALTER TABLE enquiries ADD COLUMN provider_id TEXT REFERENCES providers(id);
--> statement-breakpoint
ALTER TABLE enquiries ADD COLUMN provider_variant_id TEXT;
--> statement-breakpoint
CREATE INDEX saved_vehicles_visitor ON saved_vehicles(visitor,updated_at DESC);
--> statement-breakpoint
CREATE INDEX enquiries_provider_variant ON enquiries(provider_id,provider_variant_id,created_at DESC);
