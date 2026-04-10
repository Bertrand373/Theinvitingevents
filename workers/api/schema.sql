-- ═══════════════════════════════════════
-- Inviting Events — D1 Schema
-- Run: wrangler d1 execute ie-db --file=schema.sql
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  room TEXT DEFAULT 'grand',
  estimated_guests INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  active INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS guests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  event_id TEXT NOT NULL,
  checked_in_at TEXT NOT NULL,
  follow_up_sent INTEGER DEFAULT 0,
  follow_up_sent_at TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  guest_id TEXT,
  r2_key TEXT NOT NULL,
  filename TEXT,
  size INTEGER,
  mime_type TEXT,
  approved INTEGER DEFAULT 0,
  source TEXT DEFAULT 'guest',       -- 'guest' or 'admin'
  destination TEXT DEFAULT 'event',  -- 'gallery', 'grand', 'auxiliary', 'studio78', 'lounge', 'homepage'
  uploaded_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (guest_id) REFERENCES guests(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_active ON events(active);
CREATE INDEX IF NOT EXISTS idx_guests_event ON guests(event_id);
CREATE INDEX IF NOT EXISTS idx_guests_email ON guests(email);
CREATE INDEX IF NOT EXISTS idx_photos_event ON photos(event_id);
CREATE INDEX IF NOT EXISTS idx_photos_guest ON photos(guest_id);
CREATE INDEX IF NOT EXISTS idx_photos_approved ON photos(approved);
CREATE INDEX IF NOT EXISTS idx_photos_dest ON photos(destination);
