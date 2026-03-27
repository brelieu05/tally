import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faCheck } from '@fortawesome/free-solid-svg-icons';

const today = () => new Date().toISOString().slice(0, 10);

const COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280',
];

export default function AddExpense({ categories, onAdd, onAddCategory, onDirtyChange }) {
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    onDirtyChange?.(amount !== '' || description !== '');
  }, [amount, description]);
  const [success, setSuccess] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(COLORS[4]);

  function switchType(newType) {
    setType(newType);
    setCategory('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount || (type === 'expense' && !category)) return;
    setSubmitting(true);
    try {
      await onAdd({ amount: parseFloat(amount), category: type === 'expense' ? category : '', description, date, type });
      setAmount('');
      setDescription('');
      setDate(today());
      onDirtyChange?.(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 1200);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddCategory(e) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const result = await onAddCategory({ name: newCatName.trim(), color: newCatColor });
    if (!result.error) {
      setCategory(result.name);
      setNewCatName('');
      setNewCatColor(COLORS[4]);
      setShowModal(false);
    }
  }

  const colorFor = (name) => categories.find(c => c.name === name)?.color || '#6B7280';

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div className="type-toggle">
            <button type="button" className={`type-toggle-btn ${type === 'expense' ? 'active' : ''}`} onClick={() => switchType('expense')}>Expense</button>
            <button type="button" className={`type-toggle-btn type-toggle-btn--income ${type === 'income' ? 'active' : ''}`} onClick={() => switchType('income')}>Income</button>
          </div>
          {success && (
            <span className={`badge${type === 'income' ? ' badge--income' : ''}`}>
              <FontAwesomeIcon icon={faCheck} style={{ fontSize: 11 }} /> Added
            </span>
          )}
        </div>
        <div className="card-body">
          <form className="add-form" onSubmit={handleSubmit}>
            {/* Amount */}
            <div className="amount-row">
              <span className="amount-symbol">$</span>
              <input
                className="amount-input"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                min="0"
                step="0.01"
                required
              />
            </div>

            {/* Category pills (expenses only) */}
            {type === 'expense' && (
              <div className="category-scroll">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`category-pill ${category === cat.name ? 'selected' : ''}`}
                    onClick={() => setCategory(cat.name)}
                  >
                    <span
                      className="cat-dot"
                      style={{ background: category === cat.name ? 'rgba(255,255,255,0.8)' : cat.color }}
                    />
                    {cat.name}
                  </button>
                ))}
                <button
                  type="button"
                  className="add-cat-pill"
                  onClick={() => setShowModal(true)}
                >
                  <FontAwesomeIcon icon={faPlus} style={{ fontSize: 12 }} />
                  New
                </button>
              </div>
            )}

            {/* Description + Date */}
            <div className="input-row">
              <input
                className="text-input"
                type="text"
                placeholder="Note (optional)"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
              <input
                className="text-input"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                style={{ flex: '0 0 auto', minWidth: 0 }}
                required
              />
            </div>

            <button
              className={`submit-btn${type === 'income' ? ' submit-btn--income' : ''}`}
              type="submit"
              disabled={submitting || !amount || (type === 'expense' && !category)}
            >
              {submitting
                ? 'Adding…'
                : type === 'income'
                  ? `Add ${amount ? `$${parseFloat(amount).toFixed(2)}` : 'Income'}${description ? ` · ${description}` : ''}`
                  : `Add ${amount ? `$${parseFloat(amount).toFixed(2)}` : 'Expense'}${category ? ` · ${category}` : ''}`
              }
            </button>
          </form>
        </div>
      </div>

      {/* New Category Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-sheet">
            <span className="modal-title">New Category</span>
            <form onSubmit={handleAddCategory} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input
                className="text-input"
                type="text"
                placeholder="Category name"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                autoFocus
                required
              />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Color
                </div>
                <div className="color-picker">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`color-swatch ${newCatColor === c ? 'selected' : ''}`}
                      style={{ background: c }}
                      onClick={() => setNewCatColor(c)}
                    />
                  ))}
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={!newCatName.trim()}>
                  Add Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
