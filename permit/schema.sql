CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, parent_id TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, company_id TEXT NOT NULL, salt TEXT NOT NULL, pin_hash TEXT NOT NULL, status TEXT NOT NULL, fails INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, approved_by TEXT, approved_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS areas (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS counters (area_id TEXT PRIMARY KEY, count INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS permits (serial TEXT PRIMARY KEY, seq INTEGER NOT NULL, area_id TEXT NOT NULL, area_code TEXT NOT NULL, company_id TEXT NOT NULL, company_name TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, day TEXT NOT NULL, status TEXT NOT NULL, type TEXT, description TEXT, has_photo INTEGER NOT NULL DEFAULT 0, photo_at TEXT, photo_by TEXT, cancelled_by TEXT, cancelled_at TEXT, cancel_reason TEXT, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS permits_updated ON permits(updated_at);
CREATE TABLE IF NOT EXISTS photos (serial TEXT PRIMARY KEY, full TEXT NOT NULL, thumb TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS assets (path TEXT PRIMARY KEY, type TEXT NOT NULL, body TEXT NOT NULL, b64 INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO meta (k, v) VALUES ('version', 1);
INSERT OR IGNORE INTO companies (id, name, type, active, created_at) VALUES ('agc', 'AGC', 'main', 1, '2026-11-01T00:00:00Z');
INSERT OR IGNORE INTO areas (id, code, name, created_at) VALUES
 ('link3','LINK3','ISFR to KFR','2026-11-01T00:00:00Z'),('ic4','IC4','KFR interchange','2026-11-01T00:00:00Z'),
 ('link4','LINK4','KFR to OLY','2026-11-01T00:00:00Z'),('link5','LINK5','OLY to IC6','2026-11-01T00:00:00Z'),
 ('ic6','IC6','KAR interchange / THU','2026-11-01T00:00:00Z'),('link6','LINK6','IC6 to IC7','2026-11-01T00:00:00Z'),
 ('ic7','IC7','ABR interchange','2026-11-01T00:00:00Z'),('link7','LINK7','IC7 to IC8','2026-11-01T00:00:00Z'),
 ('ic8','IC8','OTH interchange','2026-11-01T00:00:00Z'),('link8','LINK8','South of OTH','2026-11-01T00:00:00Z');
