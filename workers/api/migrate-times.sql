-- Migration: Add time fields to events
ALTER TABLE events ADD COLUMN start_time TEXT;
ALTER TABLE events ADD COLUMN end_time TEXT;
ALTER TABLE events ADD COLUMN timezone TEXT DEFAULT 'America/New_York';
ALTER TABLE events ADD COLUMN grace_minutes INTEGER DEFAULT 120;
