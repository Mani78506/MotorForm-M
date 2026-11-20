PRAGMA foreign_keys = ON;
--> statement-breakpoint
CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('internal','catalog','india_market','dealer')),
  status TEXT NOT NULL CHECK (status IN ('active','disabled','degraded')),
  attribution TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE cities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  state_code TEXT NOT NULL,
  state_name TEXT NOT NULL,
  registration_multiplier REAL NOT NULL DEFAULT 1 CHECK (registration_multiplier > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  country_code TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE models (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id),
  name TEXT NOT NULL,
  body_type TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(brand_id,name)
);
--> statement-breakpoint
CREATE TABLE variants (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id),
  name TEXT NOT NULL,
  fuel TEXT NOT NULL,
  gearbox TEXT NOT NULL,
  seats INTEGER,
  ex_showroom INTEGER NOT NULL CHECK (ex_showroom >= 0),
  uses_json TEXT NOT NULL,
  factory_features_json TEXT NOT NULL,
  optional_features_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(model_id,name)
);
--> statement-breakpoint
CREATE TABLE city_prices (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES variants(id),
  city_id TEXT NOT NULL REFERENCES cities(id),
  on_road INTEGER NOT NULL CHECK (on_road >= 0),
  registration INTEGER NOT NULL CHECK (registration >= 0),
  insurance INTEGER NOT NULL CHECK (insurance >= 0),
  confidence TEXT NOT NULL CHECK (confidence IN ('estimated','sourced','dealer_verified')),
  provider_id TEXT REFERENCES providers(id),
  source_url TEXT,
  checked_at TEXT NOT NULL,
  valid_until TEXT,
  UNIQUE(variant_id,city_id)
);
--> statement-breakpoint
CREATE TABLE provider_snapshots (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  resource_type TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  source_url TEXT,
  fetched_at TEXT NOT NULL,
  expires_at TEXT,
  content_hash TEXT NOT NULL,
  UNIQUE(provider_id,resource_type,resource_key,content_hash)
);
--> statement-breakpoint
CREATE TABLE dealers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city_id TEXT REFERENCES cities(id),
  email TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL
);
--> statement-breakpoint
ALTER TABLE enquiries ADD COLUMN city_id TEXT REFERENCES cities(id);
--> statement-breakpoint
ALTER TABLE enquiries ADD COLUMN dealer_id TEXT REFERENCES dealers(id);
--> statement-breakpoint
ALTER TABLE enquiries ADD COLUMN provider_snapshot_id TEXT REFERENCES provider_snapshots(id);
--> statement-breakpoint
ALTER TABLE enquiries ADD COLUMN updated_at TEXT;
--> statement-breakpoint
CREATE TABLE enquiry_events (
  id TEXT PRIMARY KEY,
  enquiry_id TEXT NOT NULL REFERENCES enquiries(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX city_prices_city_variant ON city_prices(city_id,variant_id);
--> statement-breakpoint
CREATE INDEX variants_model_active ON variants(model_id,active);
--> statement-breakpoint
CREATE INDEX provider_snapshots_lookup ON provider_snapshots(provider_id,resource_type,resource_key,fetched_at DESC);
--> statement-breakpoint
CREATE INDEX enquiries_city_status ON enquiries(city_id,status,created_at DESC);
--> statement-breakpoint
CREATE INDEX enquiry_events_enquiry ON enquiry_events(enquiry_id,created_at);
