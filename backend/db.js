// ============ backend/db.js ============
import Database from "better-sqlite3";

// Use Railway persistent volume path if set, otherwise local file (for dev)
const DB_PATH = process.env.DB_PATH || "campusdesk.db";

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','admin')),
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  category TEXT NOT NULL CHECK(category IN ('hall','equipment','room','other')),
  openTime TEXT NOT NULL,   -- 'HH:MM'
  closeTime TEXT NOT NULL,  -- 'HH:MM'
  isActive INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id),
  resourceId INTEGER NOT NULL REFERENCES resources(id),
  startTime TEXT NOT NULL,  -- ISO datetime
  endTime TEXT NOT NULL,    -- ISO datetime
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled','completed')),
  reminderSent INTEGER NOT NULL DEFAULT 0,
  recurringGroupId TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_resource_time
  ON bookings (resourceId, startTime, endTime);

CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id),
  resourceId INTEGER NOT NULL REFERENCES resources(id),
  startTime TEXT NOT NULL,
  endTime TEXT NOT NULL,
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','promoted','cancelled')),
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_waitlist_resource_time
  ON waitlist (resourceId, startTime, endTime, status);
`);


try {
  db.exec(`ALTER TABLE bookings ADD COLUMN recurringGroupId TEXT`);
} catch (e) {
  
}

export default db;