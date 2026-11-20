CREATE TABLE used_vehicle_listings (
  id TEXT PRIMARY KEY,
  city_id TEXT NOT NULL REFERENCES cities(id),
  provider_id TEXT REFERENCES providers(id),
  title TEXT NOT NULL,
  asking_price INTEGER NOT NULL,
  year INTEGER NOT NULL,
  odometer_km INTEGER NOT NULL,
  fuel TEXT,
  gearbox TEXT,
  ownership_count INTEGER,
  listing_url TEXT,
  source_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE used_vehicle_checks (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES used_vehicle_listings(id),
  check_type TEXT NOT NULL CHECK(check_type IN ('service_history','rc','insurance','hypothecation','accident','flood','odometer','inspection','tyres','battery')),
  status TEXT NOT NULL CHECK(status IN ('verified','reported','missing','failed')),
  evidence_url TEXT,
  note TEXT,
  checked_at TEXT NOT NULL,
  UNIQUE(listing_id,check_type)
);
--> statement-breakpoint
CREATE INDEX used_vehicle_city_price ON used_vehicle_listings(city_id,asking_price);
--> statement-breakpoint
CREATE INDEX used_vehicle_checks_listing ON used_vehicle_checks(listing_id,check_type);
