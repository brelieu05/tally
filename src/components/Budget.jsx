import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrashCan, faPencil, faGripVertical, faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, TouchSensor,
  useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { enqueue, cancelByTempId, makeTempId, isTempId } from '../offlineQueue';

function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocal(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

function getBoundsFor(dateStr) {
  const d = parseLocal(dateStr);
  const dayOfWeek = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - dayOfWeek);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
  const monthEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    monday:     localDateStr(monday),
    sunday:     localDateStr(sunday),
    monthStart: localDateStr(monthStart),
    monthEnd:   localDateStr(monthEnd),
    year:       d.getFullYear(),
    month:      d.getMonth() + 1,
  };
}

function fmt(n) { return Number(n).toFixed(2); }

function SortableBudgetCard({ budget, spent, periodLabel, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: budget.id });

  const limit       = parseFloat(budget.amount);
  const rawPct      = (spent / limit) * 100;
  const pct         = Math.min(rawPct, 100);
  const over        = spent > limit;
  const statusColor = over ? 'var(--red)' : rawPct >= 80 ? '#F59E0B' : 'var(--green)';

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="card"
    >
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <button className="budget-drag-handle" {...attributes} {...listeners} title="Drag to reorder">
            <FontAwesomeIcon icon={faGripVertical} />
          </button>
          <span className="cat-dot" style={{ background: budget.catColor, width: 10, height: 10 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            {budget.category || 'All Spending'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="budget-period-badge">
            {budget.period === 'daily' ? 'Daily' : budget.period === 'weekly' ? 'Weekly' : 'Monthly'}
          </span>
          <button className="debt-icon-btn" onClick={() => onEdit(budget)} title="Edit">
            <FontAwesomeIcon icon={faPencil} />
          </button>
          <button className="debt-icon-btn" onClick={() => onDelete(budget.id)} title="Delete" style={{ color: 'var(--red)' }}>
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
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{periodLabel}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: statusColor }}>
            {over ? `$${fmt(spent - limit)} over budget` : `$${fmt(limit - spent)} remaining`}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Budget({ token, categories, accountId, expenses }) {
  const today = localDateStr();

  const [budgets,     setBudgets]     = useState([]);
  const [budgetLoading, setBudgetLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(today);
  const [weekData,    setWeekData]    = useState(null);
  const [monthData,   setMonthData]   = useState(null);
  const [dayExpenses, setDayExpenses] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [showModal,   setShowModal]   = useState(false);
  const [editBudget,  setEditBudget]  = useState(null);
  const [form,        setForm]        = useState({ category: '', period: 'daily', amount: '' });
  const [saving,      setSaving]      = useState(false);

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  const isToday = selectedDate === today;
  const { monday, sunday, monthStart, monthEnd, year, month } = getBoundsFor(selectedDate);

  // Load budgets once on mount
  useEffect(() => {
    if (!accountId) return;
    setBudgetLoading(true);
    fetch(`/api/budgets?account_id=${accountId}`, { headers })
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        const savedOrder = JSON.parse(localStorage.getItem(`tally_budget_order_${accountId}`) || 'null');
        if (savedOrder) {
          const rank = Object.fromEntries(savedOrder.map((id, i) => [id, i]));
          data.sort((a, b) => (rank[a.id] ?? Infinity) - (rank[b.id] ?? Infinity));
        }
        setBudgets(data);
      })
      .finally(() => setBudgetLoading(false));
  }, [accountId]);

  // Load period data whenever selectedDate or accountId changes.
  // Weekly and monthly budgets use the same server-side aggregation as
  // WeeklyBreakdown / MonthlyBreakdown so the numbers always match.
  // Daily budgets use the expenses prop for today, or raw day expenses for historical.
  useEffect(() => {
    if (!accountId) return;
    setDataLoading(true);

    const fetches = [
      fetch(`/api/expenses/weekly?week_start=${monday}&account_id=${accountId}`, { headers })
        .then(r => r.json()).then(d => { if (d && !d.error) setWeekData(d); }),
      fetch(`/api/expenses/monthly?year=${year}&month=${month}&account_id=${accountId}`, { headers })
        .then(r => r.json()).then(d => { if (d && !d.error) setMonthData(d); }),
    ];

    if (!isToday) {
      fetches.push(
        fetch(`/api/expenses?account_id=${accountId}&start=${selectedDate}&end=${selectedDate}`, { headers })
          .then(r => r.json())
          .then(d => setDayExpenses(Array.isArray(d) ? d : []))
      );
    } else {
      setDayExpenses(null);
    }

    Promise.all(fetches).finally(() => setDataLoading(false));
  }, [selectedDate, accountId]);

  function getSpent(budget) {
    if (budget.period === 'daily') {
      const src = isToday ? (expenses || []) : (dayExpenses || []);
      return src
        .filter(e =>
          e.type !== 'income' &&
          (e.date || '').slice(0, 10) === selectedDate &&
          (!budget.category || e.category === budget.category)
        )
        .reduce((sum, e) => sum + parseFloat(e.amount), 0);
    }

    if (budget.period === 'weekly') {
      if (!weekData) return 0;
      if (!budget.category) return Number(weekData.total || 0);
      const cat = (weekData.byCategory || []).find(c => c.category === budget.category);
      return cat ? Number(cat.total) : 0;
    }

    // monthly
    if (!monthData) return 0;
    if (!budget.category) return Number(monthData.total || 0);
    const cat = (monthData.byCategory || []).find(c => c.category === budget.category);
    return cat ? Number(cat.total) : 0;
  }

  function getPeriodLabel(period) {
    const sel = parseLocal(selectedDate);
    if (period === 'daily') {
      if (isToday) return 'Today';
      return sel.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    if (period === 'weekly') {
      const mo = parseLocal(monday);
      const su = parseLocal(sunday);
      const f  = d => d.toLocaleDateString('default', { month: 'short', day: 'numeric' });
      return `${f(mo)} – ${f(su)}`;
    }
    return parseLocal(monthStart).toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  function getCatColor(name) {
    return categories.find(c => c.name === name)?.color || '#6B7280';
  }

  function goBack() {
    const d = parseLocal(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(localDateStr(d));
  }
  function goForward() {
    const d = parseLocal(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(localDateStr(d));
  }

  function saveOrder(ordered) {
    localStorage.setItem(`tally_budget_order_${accountId}`, JSON.stringify(ordered.map(b => b.id)));
  }

  const sensors = useSensors(
    useSensor(PointerSensor,  { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,    { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    setBudgets(prev => {
      const reordered = arrayMove(prev, prev.findIndex(b => b.id === active.id), prev.findIndex(b => b.id === over.id));
      saveOrder(reordered);
      return reordered;
    });
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
        const patch = { category: form.category, period: form.period, amount: amt };
        if (isTempId(editBudget.id)) {
          // Still offline — update the queued add payload and local state
          enqueue({ type: 'edit_budget', payload: { id: editBudget.id, ...patch } });
          setBudgets(prev => prev.map(b => b.id === editBudget.id ? { ...b, ...patch } : b));
        } else if (!navigator.onLine) {
          enqueue({ type: 'edit_budget', payload: { id: editBudget.id, ...patch } });
          setBudgets(prev => prev.map(b => b.id === editBudget.id ? { ...b, ...patch } : b));
        } else {
          const res = await fetch(`/api/budgets/${editBudget.id}`, {
            method: 'PUT', headers,
            body: JSON.stringify(patch),
          });
          const updated = await res.json();
          setBudgets(prev => prev.map(b => b.id === editBudget.id ? updated : b));
        }
      } else {
        const payload = { account_id: accountId, category: form.category, period: form.period, amount: amt };
        if (!navigator.onLine) {
          const tempId = makeTempId();
          const tempBudget = { id: tempId, ...payload };
          enqueue({ type: 'add_budget', tempId, payload });
          setBudgets(prev => { const next = [...prev, tempBudget]; saveOrder(next); return next; });
        } else {
          const res = await fetch('/api/budgets', {
            method: 'POST', headers,
            body: JSON.stringify(payload),
          });
          const newBudget = await res.json();
          if (!newBudget.error) {
            setBudgets(prev => { const next = [...prev, newBudget]; saveOrder(next); return next; });
          }
        }
      }
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setBudgets(prev => { const next = prev.filter(b => b.id !== id); saveOrder(next); return next; });
    if (isTempId(id)) {
      cancelByTempId(id);
      return;
    }
    if (!navigator.onLine) {
      enqueue({ type: 'delete_budget', payload: { id } });
      return;
    }
    await fetch(`/api/budgets/${id}`, { method: 'DELETE', headers });
  }

  if (budgetLoading) return <div className="spinner" />;

  const selDateDisplay = isToday
    ? 'Today'
    : parseLocal(selectedDate).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Date navigation */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="breakdown-nav" style={{ borderBottom: 'none', padding: '10px 14px' }}>
          <button className="nav-arrow" onClick={goBack}>
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span className="nav-period">{selDateDisplay}</span>
            {!isToday && (
              <button
                onClick={() => setSelectedDate(today)}
                style={{ fontSize: 11, fontWeight: 700, color: 'var(--orange)', letterSpacing: '0.2px' }}
              >
                Back to today
              </button>
            )}
          </div>
          <button className="nav-arrow" onClick={goForward} disabled={isToday}>
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>
      </div>

      {budgets.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <span className="empty-icon">💰</span>
            <span className="empty-text">No budgets yet</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.4 }}>
              Set a daily, weekly, or monthly spending limit by category or for all spending.
            </span>
          </div>
        </div>
      ) : dataLoading ? (
        <div className="spinner" />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={budgets.map(b => b.id)} strategy={verticalListSortingStrategy}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {budgets.map(budget => (
                <SortableBudgetCard
                  key={budget.id}
                  budget={{ ...budget, catColor: budget.category ? getCatColor(budget.category) : '#6B7280' }}
                  spent={getSpent(budget)}
                  periodLabel={getPeriodLabel(budget.period)}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
                {['daily', 'weekly', 'monthly'].map(p => (
                  <button
                    key={p}
                    className={`type-toggle-btn ${form.period === p ? 'active' : ''}`}
                    style={{ flex: 1 }}
                    onClick={() => setForm(f => ({ ...f, period: p }))}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
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
