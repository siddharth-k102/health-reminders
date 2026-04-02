const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#e2b714',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    notes TEXT,
    due_date TEXT,
    list_id INTEGER,
    completed INTEGER DEFAULT 0,
    flagged INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS health_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    miles REAL NOT NULL,
    duration_minutes INTEGER NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed default lists if none exist
const listCount = db.prepare('SELECT COUNT(*) as count FROM lists').get();
if (listCount.count === 0) {
  const insert = db.prepare('INSERT INTO lists (name, color) VALUES (?, ?)');
  insert.run('Personal', '#e2b714');
  insert.run('Work', '#ca4754');
  insert.run('Shopping', '#46a6a1');
}

module.exports = db;
