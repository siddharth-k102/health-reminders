const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Lists ────────────────────────────────────────────────────────────────────

app.get('/api/lists', (req, res) => {
  const lists = db.prepare(`
    SELECT l.*, COUNT(r.id) FILTER (WHERE r.completed = 0) as pending_count
    FROM lists l
    LEFT JOIN reminders r ON r.list_id = l.id
    GROUP BY l.id
    ORDER BY l.created_at
  `).all();
  res.json(lists);
});

app.post('/api/lists', (req, res) => {
  const { name, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const result = db.prepare('INSERT INTO lists (name, color) VALUES (?, ?)').run(name.trim(), color || '#e2b714');
    const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(list);
  } catch (e) {
    res.status(400).json({ error: 'List name already exists' });
  }
});

app.delete('/api/lists/:id', (req, res) => {
  db.prepare('DELETE FROM reminders WHERE list_id = ?').run(req.params.id);
  db.prepare('DELETE FROM lists WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Reminders ────────────────────────────────────────────────────────────────

app.get('/api/reminders', (req, res) => {
  const { list_id, view } = req.query;
  let query = `
    SELECT r.*, l.name as list_name, l.color as list_color
    FROM reminders r
    LEFT JOIN lists l ON r.list_id = l.id
  `;
  const params = [];

  if (view === 'today') {
    query += ` WHERE (date(r.due_date) = date('now') OR (r.due_date IS NULL AND date(r.created_at) = date('now'))) AND r.completed = 0`;
  } else if (view === 'flagged') {
    query += ` WHERE r.flagged = 1 AND r.completed = 0`;
  } else if (view === 'all') {
    query += ` WHERE r.completed = 0`;
  } else if (list_id) {
    query += ` WHERE r.list_id = ?`;
    params.push(list_id);
  }

  query += ` ORDER BY r.flagged DESC, r.due_date ASC NULLS LAST, r.created_at DESC`;
  res.json(db.prepare(query).all(...params));
});

app.post('/api/reminders', (req, res) => {
  const { title, notes, due_date, list_id, flagged } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
  const result = db.prepare(
    'INSERT INTO reminders (title, notes, due_date, list_id, flagged) VALUES (?, ?, ?, ?, ?)'
  ).run(title.trim(), notes || null, due_date || null, list_id || null, flagged ? 1 : 0);
  const reminder = db.prepare(`
    SELECT r.*, l.name as list_name, l.color as list_color
    FROM reminders r LEFT JOIN lists l ON r.list_id = l.id
    WHERE r.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(reminder);
});

app.put('/api/reminders/:id', (req, res) => {
  const { title, notes, due_date, list_id, completed, flagged } = req.body;
  const existing = db.prepare('SELECT * FROM reminders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare(`
    UPDATE reminders SET
      title = ?, notes = ?, due_date = ?, list_id = ?,
      completed = ?, flagged = ?
    WHERE id = ?
  `).run(
    title ?? existing.title,
    notes !== undefined ? notes : existing.notes,
    due_date !== undefined ? due_date : existing.due_date,
    list_id !== undefined ? list_id : existing.list_id,
    completed !== undefined ? (completed ? 1 : 0) : existing.completed,
    flagged !== undefined ? (flagged ? 1 : 0) : existing.flagged,
    req.params.id
  );

  const updated = db.prepare(`
    SELECT r.*, l.name as list_name, l.color as list_color
    FROM reminders r LEFT JOIN lists l ON r.list_id = l.id
    WHERE r.id = ?
  `).get(req.params.id);
  res.json(updated);
});

app.delete('/api/reminders/:id', (req, res) => {
  db.prepare('DELETE FROM reminders WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  const { limit = 30 } = req.query;
  const logs = db.prepare(`
    SELECT * FROM health_logs
    ORDER BY date DESC
    LIMIT ?
  `).all(Number(limit));
  res.json(logs);
});

app.get('/api/health/stats', (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_runs,
      ROUND(SUM(miles), 2) as total_miles,
      ROUND(AVG(miles), 2) as avg_miles,
      SUM(duration_minutes) as total_minutes,
      ROUND(AVG(duration_minutes), 0) as avg_duration,
      MAX(miles) as best_run
    FROM health_logs
    WHERE date >= date('now', '-30 days')
  `).get();

  const weekly = db.prepare(`
    SELECT
      strftime('%Y-W%W', date) as week,
      ROUND(SUM(miles), 2) as miles,
      COUNT(*) as runs
    FROM health_logs
    WHERE date >= date('now', '-8 weeks')
    GROUP BY week
    ORDER BY week ASC
  `).all();

  res.json({ stats, weekly });
});

app.post('/api/health', (req, res) => {
  const { date, miles, duration_minutes, notes } = req.body;
  if (!date || !miles || !duration_minutes) {
    return res.status(400).json({ error: 'Date, miles, and duration are required' });
  }
  const result = db.prepare(
    'INSERT INTO health_logs (date, miles, duration_minutes, notes) VALUES (?, ?, ?, ?)'
  ).run(date, Number(miles), Number(duration_minutes), notes || null);
  const log = db.prepare('SELECT * FROM health_logs WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(log);
});

app.delete('/api/health/:id', (req, res) => {
  db.prepare('DELETE FROM health_logs WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
