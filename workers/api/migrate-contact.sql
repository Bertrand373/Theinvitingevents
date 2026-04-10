-- Migration: Contact submissions table
CREATE TABLE IF NOT EXISTS contact_submissions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  event_type TEXT DEFAULT '',
  event_date TEXT DEFAULT '',
  message TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  read INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_contacts_date ON contact_submissions(created_at);
