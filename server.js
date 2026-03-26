import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET    = process.env.JWT_SECRET    || 'changeme';
const APP_USERNAME  = process.env.APP_USERNAME  || 'admin';
const APP_PASSWORD  = process.env.APP_PASSWORD  || 'password';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

app.use(express.json());

// ── Init schema ───────────────────────────────────────────────
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id    SERIAL PRIMARY KEY,
      name  TEXT UNIQUE NOT NULL,
      color TEXT NOT NULL DEFAULT '#6B7280'
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id          SERIAL PRIMARY KEY,
      amount      NUMERIC(10,2) NOT NULL,
      category    TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      date        DATE NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS split_bills (
      id         TEXT PRIMARY KEY,
      data       JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Seed default categories
  const seeds = [
    ['Food',          '#F97316'],
    ['Transport',     '#3B82F6'],
    ['Entertainment', '#8B5CF6'],
    ['Shopping',      '#EC4899'],
    ['Bills',         '#EAB308'],
    ['Health',        '#22C55E'],
    ['Other',         '#6B7280'],
  ];
  for (const [name, color] of seeds) {
    await pool.query(
      `INSERT INTO categories (name, color) VALUES ($1, $2)
       ON CONFLICT (name) DO NOTHING`,
      [name, color]
    );
  }
}

initDb().catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});

// ── Auth ──────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === APP_USERNAME && password === APP_PASSWORD) {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '30d' });
    return res.json({ token });
  }
  res.status(401).json({ error: 'Invalid username or password' });
});

// ── Split bills (no auth) ─────────────────────────────────────
app.post('/api/split', async (req, res) => {
  const data = req.body;
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Invalid data' });

  let id, exists;
  do {
    id = Math.random().toString(36).slice(2, 8);
    const { rows } = await pool.query('SELECT id FROM split_bills WHERE id = $1', [id]);
    exists = rows.length > 0;
  } while (exists);

  await pool.query('INSERT INTO split_bills (id, data) VALUES ($1, $2)', [id, JSON.stringify(data)]);
  res.json({ id });
});

app.get('/api/split/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT data FROM split_bills WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0].data);
});

// ── Categories ────────────────────────────────────────────────
app.get('/api/categories', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, color FROM categories ORDER BY name');
  res.json(rows);
});

app.post('/api/categories', requireAuth, async (req, res) => {
  const { name, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO categories (name, color) VALUES ($1, $2) RETURNING id, name, color`,
      [name.trim(), color || '#6B7280']
    );
    res.json(rows[0]);
  } catch {
    res.status(400).json({ error: 'Category already exists' });
  }
});

app.delete('/api/categories/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ── Expenses ──────────────────────────────────────────────────
app.get('/api/expenses', requireAuth, async (req, res) => {
  const { start, end } = req.query;
  if (start && end) {
    const { rows } = await pool.query(
      `SELECT * FROM expenses WHERE date >= $1 AND date <= $2
       ORDER BY date DESC, created_at DESC`,
      [start, end]
    );
    res.json(rows);
  } else {
    const { rows } = await pool.query(
      `SELECT * FROM expenses ORDER BY date DESC, created_at DESC LIMIT 50`
    );
    res.json(rows);
  }
});

app.post('/api/expenses', requireAuth, async (req, res) => {
  const { amount, category, description, date } = req.body;
  if (!amount || !category || !date) return res.status(400).json({ error: 'Amount, category, date required' });
  const { rows } = await pool.query(
    `INSERT INTO expenses (amount, category, description, date)
     VALUES ($1, $2, $3, $4)
     RETURNING id, amount, category, description, date`,
    [parseFloat(amount), category, description?.trim() || '', date]
  );
  res.json(rows[0]);
});

app.delete('/api/expenses/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ── Weekly breakdown ──────────────────────────────────────────
app.get('/api/expenses/weekly', requireAuth, async (req, res) => {
  const { week_start } = req.query;
  if (!week_start) return res.status(400).json({ error: 'week_start required' });

  const [byDay, byCategory, total] = await Promise.all([
    pool.query(
      `SELECT date::text, SUM(amount) AS total
       FROM expenses
       WHERE date >= $1::date AND date <= $1::date + INTERVAL '6 days'
       GROUP BY date ORDER BY date`,
      [week_start]
    ),
    pool.query(
      `SELECT category, SUM(amount) AS total, COUNT(*) AS count
       FROM expenses
       WHERE date >= $1::date AND date <= $1::date + INTERVAL '6 days'
       GROUP BY category ORDER BY total DESC`,
      [week_start]
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM expenses
       WHERE date >= $1::date AND date <= $1::date + INTERVAL '6 days'`,
      [week_start]
    ),
  ]);

  res.json({ byDay: byDay.rows, byCategory: byCategory.rows, total: total.rows[0].total });
});

// ── Monthly breakdown ─────────────────────────────────────────
app.get('/api/expenses/monthly', requireAuth, async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year and month required' });
  const ym = `${year}-${String(month).padStart(2, '0')}`;

  const [byCategory, byWeek, total] = await Promise.all([
    pool.query(
      `SELECT category, SUM(amount) AS total, COUNT(*) AS count
       FROM expenses
       WHERE TO_CHAR(date, 'YYYY-MM') = $1
       GROUP BY category ORDER BY total DESC`,
      [ym]
    ),
    pool.query(
      `SELECT ((EXTRACT(DAY FROM date)::int - 1) / 7) + 1 AS week_num,
              SUM(amount) AS total
       FROM expenses
       WHERE TO_CHAR(date, 'YYYY-MM') = $1
       GROUP BY week_num ORDER BY week_num`,
      [ym]
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM expenses WHERE TO_CHAR(date, 'YYYY-MM') = $1`,
      [ym]
    ),
  ]);

  res.json({ byCategory: byCategory.rows, byWeek: byWeek.rows, total: total.rows[0].total });
});

// Serve built frontend
app.use(express.static(join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`Finance server on http://localhost:${PORT}`));
