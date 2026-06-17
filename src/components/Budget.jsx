import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrashCan, faPencil } from '@fortawesome/free-solid-svg-icons';

function getWeekBounds() {
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    today: now.toISOString().slice(0, 10),
    monday: monday.toISOString().slice(0, 10),
    sunday: sunday.toISOString().slice(0, 10),
  };
}

function fmt(n) {
  return n.toFixed(2);
}

export default function Budget({ token, categories, accountId }) {
  const [budgets, setBudgets] = useState([]);
  const [periodExpenses, setPeriodExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editBudget, setEditBudget] = useState(null);
  const [form, setForm] = useState({ category: '', period: 'daily', amount: '' });
  const [saving, setSaving] = useState(false);

  const { today, monday, sunday } = getWeekBounds();
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    if (!accountId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/budgets?account_id=${accountId}`, { headers }).then(r => r.json()).then(setBudgets),
      fetch(`/api/expenses?account_id=${accountId}&start=${monday}&end=${sunday}`, { headers }).then(r => r.json()).then(setPeriodExpenses),
    ]).finally(() => setLoading(false));
  }, [accountId]);

  function getSpent(budget) {
    return periodExpenses
      .filter(e => {
        if (e.type === 'income') return false;
        if (budget.period === 'daily' && e.date !== today) return false;
        if (budget.category && e.category !== budget.category) return false;
        return true;
      })
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
  }

  function getCatColor(name) {
    return categories.find(c => c.name === name)?.color || '#6B7280';
  }

  function openAdd() {
    setEditBudget(null);
    setForm({ category: '', period: 'daily', amount: '' });
    setShowModal(true);
  }

  function openEdit(budget) {
    setEditBudget(budget);
    setForm({ category: budget.category, period: budget.period, amount: String(budget.amount) });
    setShowModal(true);
  }

  async function handleSave() {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) return;
    setSaving(true);
    try {
      if (editBudget) {
        const res = await fetch(`/api/budgets/${editBudget.id}`, {
          method: 'PUT', headers,
          body: JSON.stringify({ category: form.category, period: form.period, amount: amt }),
        });
        const updated = await res.json();
        setBudgets(prev => prev.map(b => b.id === editBudget.id ? updated : b));
      } else {
        const res = await fetch('/api/budgets', {
          method: 'POST', headers,
          body: JSON.stringify({ account_id: accountId, category: form.category, period: form.period, amount: amt }),
        });
        const newBudget = await res.json();
        setBudgets(prev => [...prev, newBudget]);
      }
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    await fetch(`/api/budgets/${id}`, { method: 'DELETE', headers });
    setBudgets(prev => prev.filter(b => b.id !== id));
  }

  if (loading) return <div className="spinner" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {budgets.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <span className="empty-icon">💰</span>
            <span className="empty-text">No budgets yet</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.4 }}>
              Set a daily or weekly spending limit by category or for all spending.
            </span>
          </div>
        </div>
      ) : (
        budgets.map(budget => {
          const spent = getSpent(budget);
          const limit = parseFloat(budget.amount);
          const rawPct = (spent / limit) * 100;
          const pct = Math.min(rawPct, 100);
          const over = spent > limit;
          const statusColor = over ? 'var(--red)' : rawPct >= 80 ? '#F59E0B' : 'var(--green)';
          const catColor = budget.category ? getCatColor(budget.category) : '#6B7280';

          return (
            <div key={budget.id} className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span className="cat-dot" style={{ background: catColor, width: 10, height: 10 }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                    {budget.category || 'All Spending'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="budget-period-badge">
                    {budget.period === 'daily' ? 'Daily' : 'Weekly'}
                  </span>
                  <button className="debt-icon-btn" onClick={() => openEdit(budget)} title="Edit">
                    <FontAwesomeIcon icon={faPencil} />
                  </button>
                  <button className="debt-icon-btn" onClick={() => handleDelete(budget.id)} title="Delete" style={{ color: 'var(--red)' }}>
                    <FontAwesomeIcon icon={faTrashCan} style={{ fontSize: 11 }} />
                  </button>
                </div>
              </div>
              <div className="card-body" style={{ paddingTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)' }}>
                    ${fmt(spent)}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
                    of ${fmt(limit)}
                  </span>
                </div>
                <div className="cat-bar-track" style={{ height: 8, marginBottom: 10 }}>
                  <div className="cat-bar-fill" style={{ width: `${pct}%`, background: statusColor }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {budget.period === 'daily' ? 'Today' : 'Mon – Sun'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: statusColor }}>
                    {over
                      ? `$${fmt(spent - limit)} over budget`
                      : `$${fmt(limit - spent)} remaining`}
                  </span>
                </div>
              </div>
            </div>
          );
        })
      )}

      <button className="debt-add-btn" onClick={openAdd}>
        <FontAwesomeIcon icon={faPlus} />
        Add Budget
      </button>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <span className="modal-title">{editBudget ? 'Edit Budget' : 'New Budget'}</span>

            <div>
              <div className="debt-form-label" style={{ marginBottom: 8 }}>Category</div>
              <div className="category-scroll">
                <button
                  className={`category-pill ${form.category === '' ? 'selected' : ''}`}
                  onClick={() => setForm(f => ({ ...f, category: '' }))}
                >
                  All Spending
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    className={`category-pill ${form.category === cat.name ? 'selected' : ''}`}
                    onClick={() => setForm(f => ({ ...f, category: cat.name }))}
                  >
                    <span className="cat-dot" style={{ background: cat.color }} />
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="debt-form-label" style={{ marginBottom: 8 }}>Period</div>
              <div className="type-toggle">
                <button
                  className={`type-toggle-btn ${form.period === 'daily' ? 'active' : ''}`}
                  style={{ flex: 1 }}
                  onClick={() => setForm(f => ({ ...f, period: 'daily' }))}
                >
                  Daily
                </button>
                <button
                  className={`type-toggle-btn ${form.period === 'weekly' ? 'active' : ''}`}
                  style={{ flex: 1 }}
                  onClick={() => setForm(f => ({ ...f, period: 'weekly' }))}
                >
                  Weekly
                </button>
              </div>
            </div>

            <div>
              <div className="debt-form-label" style={{ marginBottom: 8 }}>Budget Limit</div>
              <div className="amount-row">
                <span className="amount-symbol">$</span>
                <input
                  className="amount-input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  style={{ fontSize: 24 }}
                  autoFocus
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={!form.amount || parseFloat(form.amount) <= 0 || saving}
              >
                {saving ? 'Saving…' : editBudget ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
