CREATE TABLE catalog (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE shortlist (visitor TEXT NOT NULL, variant TEXT NOT NULL, PRIMARY KEY (visitor, variant));
--> statement-breakpoint
CREATE TABLE enquiries (id TEXT PRIMARY KEY, visitor TEXT NOT NULL, variant TEXT NOT NULL, title TEXT NOT NULL, purpose TEXT NOT NULL, upgrades TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'received', created_at TEXT NOT NULL, email TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX enquiries_visitor ON enquiries (visitor, created_at);
