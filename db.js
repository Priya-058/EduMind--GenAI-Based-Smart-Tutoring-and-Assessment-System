// db.js - SQLite setup using better-sqlite3
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'app.db'));

// users table
db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();

// attempts table
db.prepare(`
CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  score INTEGER,
  total INTEGER,
  weak_concepts TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();

module.exports = db;