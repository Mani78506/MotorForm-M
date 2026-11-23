CREATE TABLE variant_specifications (
  variant_id TEXT NOT NULL REFERENCES variants(id),
  spec_key TEXT NOT NULL,
  label TEXT NOT NULL,
  value_text TEXT NOT NULL,
  unit TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('sourced','dealer_verified')),
  source_url TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (variant_id, spec_key)
);
--> statement-breakpoint
CREATE TABLE variant_equipment (
  variant_id TEXT NOT NULL REFERENCES variants(id),
  feature_key TEXT NOT NULL,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  value_text TEXT NOT NULL,
  note TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('sourced','dealer_verified')),
  source_url TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (variant_id, feature_key)
);
--> statement-breakpoint
CREATE TABLE dealer_state_coverage (
  dealer_id TEXT NOT NULL REFERENCES dealers(id),
  state_code TEXT NOT NULL,
  PRIMARY KEY (dealer_id, state_code)
);
--> statement-breakpoint
CREATE TABLE catalog_imports (
  id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  imported_by TEXT NOT NULL,
  records_created INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX variant_specifications_variant ON variant_specifications(variant_id);
--> statement-breakpoint
CREATE INDEX variant_equipment_variant ON variant_equipment(variant_id, category);
