CREATE TABLE catalog_curation_targets (
  id TEXT PRIMARY KEY,
  brand_name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  body_type TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'source_collection' CHECK (stage IN ('source_collection','variant_capture','quality_review','published','blocked')),
  source_count INTEGER NOT NULL DEFAULT 0,
  imported_variant_count INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX catalog_curation_targets_stage ON catalog_curation_targets(stage, brand_name, model_name);
