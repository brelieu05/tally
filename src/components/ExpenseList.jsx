import { useState, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faReceipt, faUtensils, faCar, faFilm, faBagShopping,
  faBolt, faHeartPulse, faTag, faPen, faArrowUp,
} from '@fortawesome/free-solid-svg-icons';
import { faTrashCan } from '@fortawesome/free-regular-svg-icons';

const today = () => new Date().toISOString().slice(0, 10);

const CATEGORY_ICONS = {
  food:          faUtensils,
  transport:     faCar,
  entertainment: faFilm,
  shopping:      faBagShopping,
  bills:         faBolt,
  health:        faHeartPulse,
};

function iconFor(name) {
  return CATEGORY_ICONS[name.toLowerCase()] ?? faTag;
}

function formatDate(dateStr) {
  const datePart = dateStr.slice(0, 10);
  const d = new Date(datePart + 'T00:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (datePart === today.toISOString().slice(0, 10)) return 'Today';
  if (datePart === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatAmount(n) {
  return '$' + Number(n).toFixed(2);
}

export default function ExpenseList({ expenses, categories, onDelete, onEdit, loading, balance, onBalanceChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);
  const [editingExp, setEditingExp] = useState(null); // expense being edited
  const [editDraft, setEditDraft] = useState({});
  const [saving, setSaving] = useState(false);

  function openEdit(exp) {
    setEditDraft({
      amount: String(exp.amount),
      category: exp.category || '',
      description: exp.description || '',
      date: exp.date?.slice(0, 10) || today(),
      type: exp.type || 'expense',
    });
    setEditingExp(exp);
  }

  async function commitExpEdit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await onEdit(editingExp.id, {
        ...editDraft,
        amount: parseFloat(editDraft.amount),
      });
      setEditingExp(null);
    } finally {
      setSaving(false);
    }
  }

  const colorFor = (name) => categories.find(c => c.name === name)?.color || '#6B7280';
  const totalSpent  = expenses.filter(e => e.type !== 'income').reduce((sum, e) => sum + Number(e.amount), 0);
  const totalIncome = expenses.filter(e => e.type === 'income').reduce((sum, e) => sum + Number(e.amount), 0);
  const currentBalance = balance !== null ? balance - totalSpent + totalIncome : null;

  function startEdit() {
    setDraft(balance !== null ? String(balance) : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commitEdit() {
    const val = parseFloat(draft);
    if (!isNaN(val) && val >= 0) onBalanceChange(val);
    setEditing(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') setEditing(false);
  }

  if (loading) return <div className="spinner" />;

  return (
    <>
      <div className="balance-card">
        <div className="balance-card-header">
          <span className="card-title">Balance</span>
          {!editing && (
            <button className="balance-edit-btn" onClick={startEdit} title="Edit balance">
              <FontAwesomeIcon icon={faPen} />
            </button>
          )}
        </div>
        {editing ? (
          <div className="balance-edit-row">
            <span className="balance-symbol">$</span>
            <input
              ref={inputRef}
              className="balance-input"
              type="number"
              min="0"
              step="0.01"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              placeholder="0.00"
            />
          </div>
        ) : balance !== null ? (
          <div className="balance-body">
            <span className={`balance-amount${currentBalance < 0 ? ' balance-negative' : ''}`}>
              {currentBalance < 0 ? '-' : ''}${Math.abs(currentBalance).toFixed(2)}
            </span>
            <div className="balance-meta">
              <span>Set&nbsp;${Number(balance).toFixed(2)}</span>
              <span className="expense-dot">·</span>
              <span>Spent&nbsp;${totalSpent.toFixed(2)}</span>
              {totalIncome > 0 && (
                <>
                  <span className="expense-dot">·</span>
                  <span style={{ color: 'var(--green)' }}>+${totalIncome.toFixed(2)}</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <button className="balance-prompt" onClick={startEdit}>
            Tap to set your bank balance
          </button>
        )}
      </div>

    <div className="card">
      <div className="card-header">
        <span className="card-title">Recent</span>
        {expenses.length > 0 && (
          <span className="badge">{expenses.length} transactions</span>
        )}
      </div>

      {expenses.length === 0 ? (
        <div className="empty-state">
          <FontAwesomeIcon icon={faReceipt} className="empty-icon" />
          <span className="empty-text">No expenses yet — add one above</span>
        </div>
      ) : (
        <div className="expense-list">
          {expenses.map(exp => {
            const isIncome = exp.type === 'income';
            const color = isIncome ? '#22C55E' : colorFor(exp.category);
            return (
              <div key={exp.id} className="expense-item">
                <div
                  className="expense-cat-icon"
                  style={{
                    background: `${color}22`,
                    border: `1px solid ${color}44`,
                    color,
                  }}
                >
                  <FontAwesomeIcon icon={isIncome ? faArrowUp : iconFor(exp.category)} />
                </div>
                <div className="expense-info">
                  <div className="expense-desc">
                    {isIncome ? (exp.description || 'Income') : (exp.description || exp.category)}
                  </div>
                  <div className="expense-meta">
                    {!isIncome && exp.description && (
                      <>
                        <span className="expense-cat">{exp.category}</span>
                        <span className="expense-dot">·</span>
                      </>
                    )}
                    <span className="expense-date">{formatDate(exp.date)}</span>
                  </div>
                </div>
                <div className="expense-right">
                  <span className={`expense-amount${isIncome ? ' expense-amount--income' : ''}`}>
                    {isIncome ? '+' : ''}{formatAmount(exp.amount)}
                  </span>
                  <button
                    className="delete-btn"
                    onClick={() => openEdit(exp)}
                    title="Edit"
                  >
                    <FontAwesomeIcon icon={faPen} />
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() => onDelete(exp.id)}
                    title="Delete"
                  >
                    <FontAwesomeIcon icon={faTrashCan} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

    {editingExp && (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditingExp(null)}>
        <div className="modal-sheet">
          <span className="modal-title">Edit Transaction</span>
          <form onSubmit={commitExpEdit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="amount-row">
              <span className="amount-symbol">$</span>
              <input
                className="amount-input"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={editDraft.amount}
                onChange={e => setEditDraft(d => ({ ...d, amount: e.target.value }))}
                min="0"
                step="0.01"
                required
                autoFocus
              />
            </div>

            <div className="type-toggle">
              <button type="button" className={`type-toggle-btn ${editDraft.type === 'expense' ? 'active' : ''}`} onClick={() => setEditDraft(d => ({ ...d, type: 'expense', category: '' }))}>Expense</button>
              <button type="button" className={`type-toggle-btn type-toggle-btn--income ${editDraft.type === 'income' ? 'active' : ''}`} onClick={() => setEditDraft(d => ({ ...d, type: 'income', category: '' }))}>Income</button>
            </div>

            {editDraft.type === 'expense' && (
              <div className="category-scroll">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`category-pill ${editDraft.category === cat.name ? 'selected' : ''}`}
                    onClick={() => setEditDraft(d => ({ ...d, category: cat.name }))}
                  >
                    <span className="cat-dot" style={{ background: editDraft.category === cat.name ? 'rgba(255,255,255,0.8)' : cat.color }} />
                    {cat.name}
                  </button>
                ))}
              </div>
            )}

            <div className="input-row">
              <input
                className="text-input"
                type="text"
                placeholder="Note (optional)"
                value={editDraft.description}
                onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))}
              />
              <input
                className="text-input"
                type="date"
                value={editDraft.date}
                onChange={e => setEditDraft(d => ({ ...d, date: e.target.value }))}
                style={{ width: 130, flexShrink: 0 }}
                required
              />
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setEditingExp(null)}>Cancel</button>
              <button
                type="submit"
                className="btn-primary"
                disabled={saving || !editDraft.amount || (editDraft.type === 'expense' && !editDraft.category)}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    </>
  );
}
