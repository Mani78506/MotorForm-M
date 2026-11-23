CREATE TABLE comparison_cart_items (
  visitor TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (visitor, vehicle_id, provider_id)
);
--> statement-breakpoint
CREATE INDEX comparison_cart_items_visitor ON comparison_cart_items(visitor, updated_at DESC);
