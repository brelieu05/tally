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

const JWT_SECRET   = process.env.JWT_SECRET   || 'changeme';
const APP_USERNAME = process.env.APP_USERNAME || 'admin';
const APP_PASSWORD = process.env.APP_PASSWORD || 'password';

const isLocal = !process.env.DATABASE_URL;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || null;

app.use(express.json({ limit: '10mb' }));

// ── In-memory store (local dev) ────────────────────────────────
const mem = {
  accounts:   [{ id: 1, name: 'Main' }],
  loans:         [],
  nextLoanId:    1,
  budgets:       [],
  nextBudgetId:  1,
  categories: [
    { id: 1, name: 'Food',          color: '#F97316' },
    { id: 2, name: 'Transport',     color: '#3B82F6' },
    { id: 3, name: 'Entertainment', color: '#8B5CF6' },
    { id: 4, name: 'Shopping',      color: '#EC4899' },
    { id: 5, name: 'Bills',         color: '#EAB308' },
    { id: 6, name: 'Health',        color: '#22C55E' },
    { id: 7, name: 'Other',         color: '#6B7280' },
  ],
  expenses:      [],
  splitBills:    {},
  nextAccountId: 2,
  nextCatId:     8,
  nextExpId:     1,
};

// ── Postgres pool (production only) ───────────────────────────
let pool;
if (!isLocal) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

// ── Init schema (production only) ─────────────────────────────
async function initDb() {
  if (isLocal) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id    SERIAL PRIMARY KEY,
      name  TEXT UNIQUE NOT NULL,
      color TEXT NOT NULL DEFAULT '#6B7280'
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id          SERIAL PRIMARY KEY,
      amount      NUMERIC(10,2) NOT NULL,
      category    TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      date        DATE NOT NULL,
      type        TEXT NOT NULL DEFAULT 'expense',
      account_id  INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS type       TEXT    NOT NULL DEFAULT 'expense';
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE;
    CREATE TABLE IF NOT EXISTS loans (
      id               SERIAL PRIMARY KEY,
      name             TEXT NOT NULL,
      loan_type        TEXT NOT NULL DEFAULT 'unsubsidized',
      original_amount  NUMERIC(12,2) NOT NULL,
      current_balance  NUMERIC(12,2) NOT NULL,
      interest_rate    NUMERIC(6,3) NOT NULL,
      term_months      INTEGER NOT NULL DEFAULT 120,
      monthly_payment  NUMERIC(10,2),
      start_date       DATE,
      status           TEXT NOT NULL DEFAULT 'repayment',
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS split_bills (
      id         TEXT PRIMARY KEY,
      data       JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS budgets (
      id         SERIAL PRIMARY KEY,
      account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      category   TEXT NOT NULL DEFAULT '',
      period     TEXT NOT NULL DEFAULT 'daily',
      amount     NUMERIC(10,2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // Seed default account if none exist
  await pool.query(`INSERT INTO accounts (name) SELECT 'Main' WHERE NOT EXISTS (SELECT 1 FROM accounts)`);
  // Assign existing un-owned expenses to the first account
  await pool.query(`UPDATE expenses SET account_id = (SELECT id FROM accounts ORDER BY id LIMIT 1) WHERE account_id IS NULL`);

  const seeds = [
    ['Food','#F97316'],['Transport','#3B82F6'],['Entertainment','#8B5CF6'],
    ['Shopping','#EC4899'],['Bills','#EAB308'],['Health','#22C55E'],['Other','#6B7280'],
  ];
  for (const [name, color] of seeds) {
    await pool.query(
      `INSERT INTO categories (name, color) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
      [name, color]
    );
  }
}

initDb().catch(err => { console.error('DB init failed:', err); process.exit(1); });

// ── Auth ───────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (isLocal) return next();
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
  if (isLocal) {
    const token = jwt.sign({ username: 'local' }, JWT_SECRET, { expiresIn: '30d' });
    return res.json({ token });
  }
  const { username, password } = req.body;
  if (username === APP_USERNAME && password === APP_PASSWORD) {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '30d' });
    return res.json({ token });
  }
  res.status(401).json({ error: 'Invalid username or password' });
});

// ── Split bills (no auth) ──────────────────────────────────────
app.get('/api/split', requireAuth, async (req, res) => {
  if (isLocal) {
    const bills = Object.entries(mem.splitBills)
      .map(([id, { data, created_at }]) => ({ id, data, created_at }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return res.json(bills);
  }
  const { rows } = await pool.query(
    'SELECT id, data, created_at FROM split_bills ORDER BY created_at DESC'
  );
  res.json(rows);
});

app.post('/api/split', async (req, res) => {
  const data = req.body;
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Invalid data' });

  if (isLocal) {
    let id;
    do { id = Math.random().toString(36).slice(2, 8); } while (mem.splitBills[id]);
    mem.splitBills[id] = { data, created_at: new Date().toISOString() };
    return res.json({ id });
  }

  let id, exists;
  do {
    id = Math.random().toString(36).slice(2, 8);
    const { rows } = await pool.query('SELECT id FROM split_bills WHERE id = $1', [id]);
    exists = rows.length > 0;
  } while (exists);
  await pool.query('INSERT INTO split_bills (id, data) VALUES ($1, $2)', [id, JSON.stringify(data)]);
  res.json({ id });
});

app.put('/api/split/:id', async (req, res) => {
  const data = req.body;
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Invalid data' });
  if (isLocal) {
    if (!mem.splitBills[req.params.id]) return res.status(404).json({ error: 'Not found' });
    mem.splitBills[req.params.id].data = data;
    return res.json({ id: req.params.id });
  }
  const { rowCount } = await pool.query('UPDATE split_bills SET data = $1 WHERE id = $2', [JSON.stringify(data), req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ id: req.params.id });
});

app.delete('/api/split/:id', requireAuth, async (req, res) => {
  if (isLocal) {
    delete mem.splitBills[req.params.id];
    return res.json({ success: true });
  }
  await pool.query('DELETE FROM split_bills WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/split/:id', async (req, res) => {
  if (isLocal) {
    const entry = mem.splitBills[req.params.id];
    if (!entry) return res.status(404).json({ error: 'Not found' });
    return res.json(entry.data);
  }
  const { rows } = await pool.query('SELECT data FROM split_bills WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0].data);
});

// ── Receipt Scanning ───────────────────────────────────────────
app.post('/api/scan-receipt', async (req, res) => {
  if (!OPENROUTER_API_KEY) {
    return res.status(503).json({ error: 'Receipt scanning not configured. Add OPENROUTER_API_KEY to .env (get a free key at openrouter.ai)' });
  }
  const { imageBase64, mimeType } = req.body;
  if (!imageBase64 || !mimeType) return res.status(400).json({ error: 'Missing image data' });

  const safeMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)
    ? mimeType : 'image/jpeg';

  const prompt = `Extract all purchased line items from this receipt. Return ONLY a valid JSON object with no markdown, no code fences, and no extra text. Use this exact structure:
{"billName":"restaurant or store name if visible, else empty string","items":[{"name":"item name","price":0.00}],"tax":"tax dollar amount as string or empty string","taxMode":"$","tip":"tip dollar amount as string or empty string","tipMode":"$"}
Rules: items array must contain every individual purchased item with its price. Do NOT include subtotal, tax, tip, or grand total rows as items. Prices must be plain numbers (e.g. 12.99 not "$12.99").`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'nvidia/nemotron-nano-12b-v2-vl:free',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${safeMime};base64,${imageBase64}` } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || JSON.stringify(data));

    const text = data.choices[0].message.content.trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned);
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse receipt: ' + err.message });
  }
});

// ── Loans ──────────────────────────────────────────────────────
app.get('/api/loans', requireAuth, async (req, res) => {
  if (isLocal) return res.json([...mem.loans].sort((a, b) => a.id - b.id));
  const { rows } = await pool.query('SELECT * FROM loans ORDER BY created_at');
  res.json(rows);
});

app.post('/api/loans', requireAuth, async (req, res) => {
  const { name, loan_type, original_amount, current_balance, interest_rate, term_months, monthly_payment, start_date, status } = req.body;
  if (!name?.trim() || !original_amount || !current_balance || interest_rate == null) {
    return res.status(400).json({ error: 'name, original_amount, current_balance, interest_rate required' });
  }
  if (isLocal) {
    const loan = {
      id: mem.nextLoanId++, name: name.trim(), loan_type: loan_type || 'unsubsidized',
      original_amount: parseFloat(original_amount), current_balance: parseFloat(current_balance),
      interest_rate: parseFloat(interest_rate), term_months: parseInt(term_months) || 120,
      monthly_payment: monthly_payment ? parseFloat(monthly_payment) : null,
      start_date: start_date || null, status: status || 'repayment',
    };
    mem.loans.push(loan);
    return res.json(loan);
  }
  const { rows } = await pool.query(
    `INSERT INTO loans (name, loan_type, original_amount, current_balance, interest_rate, term_months, monthly_payment, start_date, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [name.trim(), loan_type || 'unsubsidized', parseFloat(original_amount), parseFloat(current_balance),
     parseFloat(interest_rate), parseInt(term_months) || 120,
     monthly_payment ? parseFloat(monthly_payment) : null, start_date || null, status || 'repayment']
  );
  res.json(rows[0]);
});

app.put('/api/loans/:id', requireAuth, async (req, res) => {
  const { name, loan_type, original_amount, current_balance, interest_rate, term_months, monthly_payment, start_date, status } = req.body;
  const id = parseInt(req.params.id);
  if (isLocal) {
    const idx = mem.loans.findIndex(l => l.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    mem.loans[idx] = { ...mem.loans[idx], name: name.trim(), loan_type, original_amount: parseFloat(original_amount),
      current_balance: parseFloat(current_balance), interest_rate: parseFloat(interest_rate),
      term_months: parseInt(term_months) || 120, monthly_payment: monthly_payment ? parseFloat(monthly_payment) : null,
      start_date: start_date || null, status };
    return res.json(mem.loans[idx]);
  }
  const { rows } = await pool.query(
    `UPDATE loans SET name=$1, loan_type=$2, original_amount=$3, current_balance=$4, interest_rate=$5,
     term_months=$6, monthly_payment=$7, start_date=$8, status=$9 WHERE id=$10 RETURNING *`,
    [name.trim(), loan_type, parseFloat(original_amount), parseFloat(current_balance),
     parseFloat(interest_rate), parseInt(term_months) || 120,
     monthly_payment ? parseFloat(monthly_payment) : null, start_date || null, status, id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

app.delete('/api/loans/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isLocal) { mem.loans = mem.loans.filter(l => l.id !== id); return res.json({ success: true }); }
  await pool.query('DELETE FROM loans WHERE id = $1', [id]);
  res.json({ success: true });
});

// ── Accounts ───────────────────────────────────────────────────
app.get('/api/accounts', requireAuth, async (req, res) => {
  if (isLocal) return res.json([...mem.accounts]);
  const { rows } = await pool.query('SELECT id, name FROM accounts ORDER BY created_at');
  res.json(rows);
});

app.post('/api/accounts', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  if (isLocal) {
    const account = { id: mem.nextAccountId++, name: name.trim() };
    mem.accounts.push(account);
    return res.json(account);
  }
  const { rows } = await pool.query(
    'INSERT INTO accounts (name) VALUES ($1) RETURNING id, name', [name.trim()]
  );
  res.json(rows[0]);
});

app.delete('/api/accounts/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isLocal) {
    if (mem.accounts.length <= 1) return res.status(400).json({ error: 'Cannot delete last account' });
    mem.accounts = mem.accounts.filter(a => a.id !== id);
    mem.expenses = mem.expenses.filter(e => e.account_id !== id);
    return res.json({ success: true });
  }
  const { rows } = await pool.query('SELECT COUNT(*) FROM accounts');
  if (parseInt(rows[0].count) <= 1) return res.status(400).json({ error: 'Cannot delete last account' });
  await pool.query('DELETE FROM accounts WHERE id = $1', [id]);
  res.json({ success: true });
});

// ── Categories ─────────────────────────────────────────────────
app.get('/api/categories', requireAuth, async (req, res) => {
  if (isLocal) return res.json([...mem.categories].sort((a, b) => a.name.localeCompare(b.name)));
  const { rows } = await pool.query('SELECT id, name, color FROM categories ORDER BY name');
  res.json(rows);
});

app.post('/api/categories', requireAuth, async (req, res) => {
  const { name, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  if (isLocal) {
    if (mem.categories.find(c => c.name === name.trim()))
      return res.status(400).json({ error: 'Category already exists' });
    const cat = { id: mem.nextCatId++, name: name.trim(), color: color || '#6B7280' };
    mem.categories.push(cat);
    return res.json(cat);
  }
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
  if (isLocal) {
    mem.categories = mem.categories.filter(c => c.id !== parseInt(req.params.id));
    return res.json({ success: true });
  }
  await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ── Expenses ───────────────────────────────────────────────────
app.get('/api/expenses', requireAuth, async (req, res) => {
  const account_id = parseInt(req.query.account_id);
  if (!account_id) return res.status(400).json({ error: 'account_id required' });
  if (isLocal) {
    const { start, end } = req.query;
    let exps = mem.expenses.filter(e => e.account_id === account_id);
    if (start && end) {
      exps = exps.filter(e => e.date >= start && e.date <= end);
    } else {
      exps = exps.slice(0, 50);
    }
    return res.json(exps.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id));
  }
  const { start, end } = req.query;
  if (start && end) {
    const { rows } = await pool.query(
      `SELECT * FROM expenses WHERE account_id = $1 AND date >= $2 AND date <= $3 ORDER BY date DESC, created_at DESC`,
      [account_id, start, end]
    );
    res.json(rows);
  } else {
    const { rows } = await pool.query(
      `SELECT * FROM expenses WHERE account_id = $1 ORDER BY date DESC, created_at DESC LIMIT 50`,
      [account_id]
    );
    res.json(rows);
  }
});

app.post('/api/expenses', requireAuth, async (req, res) => {
  const { amount, category, description, date, type = 'expense', account_id } = req.body;
  if (!amount || !date || !account_id) return res.status(400).json({ error: 'Amount, date, and account_id required' });
  if (type === 'expense' && !category) return res.status(400).json({ error: 'Category required for expenses' });
  if (isLocal) {
    const exp = { id: mem.nextExpId++, amount: parseFloat(amount), category: category || '', description: description?.trim() || '', date, type, account_id: parseInt(account_id) };
    mem.expenses.unshift(exp);
    return res.json(exp);
  }
  const { rows } = await pool.query(
    `INSERT INTO expenses (amount, category, description, date, type, account_id) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, amount, category, description, date, type, account_id`,
    [parseFloat(amount), category || '', description?.trim() || '', date, type, parseInt(account_id)]
  );
  res.json(rows[0]);
});

app.put('/api/expenses/:id', requireAuth, async (req, res) => {
  const { amount, category, description, date, type } = req.body;
  const id = parseInt(req.params.id);
  if (isLocal) {
    const idx = mem.expenses.findIndex(e => e.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    mem.expenses[idx] = { ...mem.expenses[idx], amount: parseFloat(amount), category: category ?? '', description: description ?? '', date, type: type ?? 'expense' };
    return res.json(mem.expenses[idx]);
  }
  const { rows } = await pool.query(
    'UPDATE expenses SET amount=$1, category=$2, description=$3, date=$4, type=$5 WHERE id=$6 RETURNING *',
    [parseFloat(amount), category ?? '', description ?? '', date, type ?? 'expense', id]
  );
  res.json(rows[0]);
});

app.delete('/api/expenses/:id', requireAuth, async (req, res) => {
  if (isLocal) {
    mem.expenses = mem.expenses.filter(e => e.id !== parseInt(req.params.id));
    return res.json({ success: true });
  }
  await pool.query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ── Weekly breakdown ───────────────────────────────────────────
app.get('/api/expenses/weekly', requireAuth, async (req, res) => {
  const { week_start, account_id } = req.query;
  if (!week_start || !account_id) return res.status(400).json({ error: 'week_start and account_id required' });
  const aid = parseInt(account_id);

  if (isLocal) {
    const weekEnd = new Date(week_start);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    const exps = mem.expenses.filter(e => e.account_id === aid && e.date >= week_start && e.date <= weekEndStr && e.type !== 'income');

    const byDayMap = {};
    const byCatMap = {};
    let total = 0;
    for (const e of exps) {
      byDayMap[e.date] = (byDayMap[e.date] || 0) + parseFloat(e.amount);
      if (!byCatMap[e.category]) byCatMap[e.category] = { total: 0, count: 0 };
      byCatMap[e.category].total += parseFloat(e.amount);
      byCatMap[e.category].count++;
      total += parseFloat(e.amount);
    }
    const byDay = Object.entries(byDayMap).map(([date, t]) => ({ date, total: t })).sort((a, b) => a.date.localeCompare(b.date));
    const byCategory = Object.entries(byCatMap).map(([category, v]) => ({ category, ...v })).sort((a, b) => b.total - a.total);
    return res.json({ byDay, byCategory, total });
  }

  const [byDay, byCategory, total] = await Promise.all([
    pool.query(
      `SELECT date::text, SUM(amount) AS total FROM expenses
       WHERE account_id = $2 AND date >= $1::date AND date <= $1::date + INTERVAL '6 days' AND type = 'expense'
       GROUP BY date ORDER BY date`, [week_start, aid]
    ),
    pool.query(
      `SELECT category, SUM(amount) AS total, COUNT(*) AS count FROM expenses
       WHERE account_id = $2 AND date >= $1::date AND date <= $1::date + INTERVAL '6 days' AND type = 'expense'
       GROUP BY category ORDER BY total DESC`, [week_start, aid]
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
       WHERE account_id = $2 AND date >= $1::date AND date <= $1::date + INTERVAL '6 days' AND type = 'expense'`, [week_start, aid]
    ),
  ]);
  res.json({ byDay: byDay.rows, byCategory: byCategory.rows, total: total.rows[0].total });
});

// ── Monthly breakdown ──────────────────────────────────────────
app.get('/api/expenses/monthly', requireAuth, async (req, res) => {
  const { year, month, account_id } = req.query;
  if (!year || !month || !account_id) return res.status(400).json({ error: 'year, month, and account_id required' });
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const aid = parseInt(account_id);

  if (isLocal) {
    const exps = mem.expenses.filter(e => e.account_id === aid && e.date.slice(0, 7) === ym && e.type !== 'income');
    const byCatMap = {};
    const byWeekMap = {};
    let total = 0;
    for (const e of exps) {
      if (!byCatMap[e.category]) byCatMap[e.category] = { total: 0, count: 0 };
      byCatMap[e.category].total += parseFloat(e.amount);
      byCatMap[e.category].count++;
      const weekNum = Math.floor((parseInt(e.date.slice(8, 10)) - 1) / 7) + 1;
      byWeekMap[weekNum] = (byWeekMap[weekNum] || 0) + parseFloat(e.amount);
      total += parseFloat(e.amount);
    }
    const byCategory = Object.entries(byCatMap).map(([category, v]) => ({ category, ...v })).sort((a, b) => b.total - a.total);
    const byWeek = Object.entries(byWeekMap).map(([week_num, t]) => ({ week_num: parseInt(week_num), total: t })).sort((a, b) => a.week_num - b.week_num);
    return res.json({ byCategory, byWeek, total });
  }

  const [byCategory, byWeek, total] = await Promise.all([
    pool.query(
      `SELECT category, SUM(amount) AS total, COUNT(*) AS count FROM expenses
       WHERE account_id = $2 AND TO_CHAR(date, 'YYYY-MM') = $1 AND type = 'expense' GROUP BY category ORDER BY total DESC`, [ym, aid]
    ),
    pool.query(
      `SELECT ((EXTRACT(DAY FROM date)::int - 1) / 7) + 1 AS week_num, SUM(amount) AS total
       FROM expenses WHERE account_id = $2 AND TO_CHAR(date, 'YYYY-MM') = $1 AND type = 'expense' GROUP BY week_num ORDER BY week_num`, [ym, aid]
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE account_id = $2 AND TO_CHAR(date, 'YYYY-MM') = $1 AND type = 'expense'`, [ym, aid]
    ),
  ]);
  res.json({ byCategory: byCategory.rows, byWeek: byWeek.rows, total: total.rows[0].total });
});

// ── Budgets ────────────────────────────────────────────────────
app.get('/api/budgets', requireAuth, async (req, res) => {
  const account_id = parseInt(req.query.account_id);
  if (!account_id) return res.status(400).json({ error: 'account_id required' });
  if (isLocal) {
    return res.json(mem.budgets.filter(b => b.account_id === account_id));
  }
  const { rows } = await pool.query(
    'SELECT * FROM budgets WHERE account_id = $1 ORDER BY created_at',
    [account_id]
  );
  res.json(rows);
});

app.post('/api/budgets', requireAuth, async (req, res) => {
  const { account_id, category = '', period = 'daily', amount } = req.body;
  if (!account_id || !amount) return res.status(400).json({ error: 'account_id and amount required' });
  if (isLocal) {
    const budget = { id: mem.nextBudgetId++, account_id: parseInt(account_id), category, period, amount: parseFloat(amount) };
    mem.budgets.push(budget);
    return res.json(budget);
  }
  const { rows } = await pool.query(
    'INSERT INTO budgets (account_id, category, period, amount) VALUES ($1, $2, $3, $4) RETURNING *',
    [parseInt(account_id), category, period, parseFloat(amount)]
  );
  res.json(rows[0]);
});

app.put('/api/budgets/:id', requireAuth, async (req, res) => {
  const { category = '', period, amount } = req.body;
  const id = parseInt(req.params.id);
  if (isLocal) {
    const idx = mem.budgets.findIndex(b => b.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    mem.budgets[idx] = { ...mem.budgets[idx], category, period, amount: parseFloat(amount) };
    return res.json(mem.budgets[idx]);
  }
  const { rows } = await pool.query(
    'UPDATE budgets SET category=$1, period=$2, amount=$3 WHERE id=$4 RETURNING *',
    [category, period, parseFloat(amount), id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

app.delete('/api/budgets/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isLocal) {
    mem.budgets = mem.budgets.filter(b => b.id !== id);
    return res.json({ success: true });
  }
  await pool.query('DELETE FROM budgets WHERE id = $1', [id]);
  res.json({ success: true });
});

// ── Serve frontend ─────────────────────────────────────────────
app.use(express.static(join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`Tally server on http://localhost:${PORT} (${isLocal ? 'local mode' : 'production'})`));
