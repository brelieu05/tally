import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faTrashCan, faPlus, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

const LOAN_TYPES = [
  { value: 'subsidized',    label: 'Subsidized' },
  { value: 'unsubsidized',  label: 'Unsubsidized' },
  { value: 'private',       label: 'Private' },
  { value: 'parent_plus',   label: 'Parent PLUS' },
  { value: 'other',         label: 'Other' },
];

const STATUSES = [
  { value: 'in_school',   label: 'In School' },
  { value: 'grace',       label: 'Grace Period' },
  { value: 'repayment',   label: 'Repayment' },
  { value: 'deferment',   label: 'Deferment' },
  { value: 'forbearance', label: 'Forbearance' },
  { value: 'paid_off',    label: 'Paid Off' },
];

const TYPE_COLORS = {
  subsidized:   { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
  unsubsidized: { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
  private:      { bg: '#faf5ff', border: '#e9d5ff', text: '#7e22ce' },
  parent_plus:  { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
  other:        { bg: '#f9fafb', border: '#e5e7eb', text: '#4b5563' },
};

const STATUS_COLORS = {
  in_school:   { bg: '#eff6ff', text: '#1d4ed8' },
  grace:       { bg: '#fefce8', text: '#a16207' },
  repayment:   { bg: '#f0fdf4', text: '#15803d' },
  deferment:   { bg: '#fff7ed', text: '#c2410c' },
  forbearance: { bg: '#fef2f2', text: '#dc2626' },
  paid_off:    { bg: '#f3f4f6', text: '#6b7280' },
};

const EMPTY_FORM = {
  name: '', loan_type: 'unsubsidized', original_amount: '', current_balance: '',
  interest_rate: '', term_months: '120', monthly_payment: '', start_date: '', status: 'repayment',
};

// ── Calculations ────────────────────────────────────────────────

function isAccruing(loan) {
  if (loan.status === 'paid_off') return false;
  if (loan.loan_type === 'subsidized' &&
      (loan.status === 'in_school' || loan.status === 'grace' || loan.status === 'deferment')) return false;
  return true;
}

function stdPayment(balance, annualRate, termMonths) {
  if (!balance || !termMonths) return 0;
  if (!annualRate || annualRate === 0) return balance / termMonths;
  const r = annualRate / 100 / 12;
  return balance * r * Math.pow(1 + r, termMonths) / (Math.pow(1 + r, termMonths) - 1);
}

function effectivePayment(loan) {
  if (loan.monthly_payment) return parseFloat(loan.monthly_payment);
  return stdPayment(parseFloat(loan.current_balance), parseFloat(loan.interest_rate), parseInt(loan.term_months));
}

function monthsToPayoff(balance, annualRate, monthlyPmt) {
  if (!monthlyPmt || monthlyPmt <= 0) return null;
  if (!annualRate || annualRate === 0) return Math.ceil(balance / monthlyPmt);
  const r = annualRate / 100 / 12;
  const monthlyInt = balance * r;
  if (monthlyPmt <= monthlyInt) return null;
  return Math.ceil(-Math.log(1 - (balance * r) / monthlyPmt) / Math.log(1 + r));
}

function payoffDateStr(months) {
  if (months == null) return null;
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function totalInterestRemaining(balance, annualRate, monthlyPmt, months) {
  if (months == null || !monthlyPmt) return null;
  return Math.max(0, monthlyPmt * months - balance);
}

function fmt(n) { return '$' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function fmtRate(r) { return Number(r).toFixed(2) + '%'; }

// ── Component ────────────────────────────────────────────────────

export default function DebtTracker({ token }) {
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null); // loan id being edited
  const [form, setForm] = useState(EMPTY_FORM);

  const auth = { Authorization: `Bearer ${token}` };

  useEffect(() => { fetchLoans(); }, []);

  async function fetchLoans() {
    setLoading(true);
    try {
      const res = await fetch('/api/loans', { headers: auth });
      setLoans(await res.json());
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(loan) {
    setEditing(loan.id);
    setForm({
      name:            loan.name,
      loan_type:       loan.loan_type,
      original_amount: String(loan.original_amount),
      current_balance: String(loan.current_balance),
      interest_rate:   String(loan.interest_rate),
      term_months:     String(loan.term_months),
      monthly_payment: loan.monthly_payment ? String(loan.monthly_payment) : '',
      start_date:      loan.start_date ? loan.start_date.slice(0, 10) : '',
      status:          loan.status,
    });
    setShowModal(true);
  }

  function closeModal() { setShowModal(false); setEditing(null); }

  function setField(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSave() {
    const payload = {
      ...form,
      original_amount: parseFloat(form.original_amount),
      current_balance: parseFloat(form.current_balance),
      interest_rate:   parseFloat(form.interest_rate),
      term_months:     parseInt(form.term_months) || 120,
      monthly_payment: form.monthly_payment ? parseFloat(form.monthly_payment) : null,
      start_date:      form.start_date || null,
    };
    if (!payload.name || isNaN(payload.original_amount) || isNaN(payload.current_balance) || isNaN(payload.interest_rate)) return;

    if (editing != null) {
      const res = await fetch(`/api/loans/${editing}`, {
        method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const updated = await res.json();
      setLoans(prev => prev.map(l => l.id === editing ? updated : l));
    } else {
      const res = await fetch('/api/loans', {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const created = await res.json();
      setLoans(prev => [...prev, created]);
    }
    closeModal();
  }

  async function handleDelete(id) {
    await fetch(`/api/loans/${id}`, { method: 'DELETE', headers: auth });
    setLoans(prev => prev.filter(l => l.id !== id));
  }

  const activeLoans = loans.filter(l => l.status !== 'paid_off');
  const paidLoans   = loans.filter(l => l.status === 'paid_off');
  const totalBalance  = activeLoans.reduce((s, l) => s + parseFloat(l.current_balance), 0);
  const totalMonthly  = activeLoans.reduce((s, l) => s + effectivePayment(l), 0);
  const totalOriginal = activeLoans.reduce((s, l) => s + parseFloat(l.original_amount), 0);
  const totalPaid     = totalOriginal - totalBalance;
  const overallProgress = totalOriginal > 0 ? Math.max(0, Math.min(100, (totalPaid / totalOriginal) * 100)) : 0;
  const weightedRate = activeLoans.length > 0
    ? activeLoans.reduce((s, l) => s + parseFloat(l.interest_rate) * parseFloat(l.current_balance), 0) / (totalBalance || 1)
    : 0;

  const formValid = form.name.trim() && form.original_amount && form.current_balance && form.interest_rate !== '';

  if (loading) return <div className="spinner" style={{ marginTop: 40 }} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Summary ── */}
      {loans.length > 0 && (
        <div className="debt-summary-card">
          <div className="debt-summary-row">
            <div className="debt-summary-col">
              <span className="debt-summary-label">Total Debt</span>
              <span className="debt-summary-value">{fmt(totalBalance)}</span>
            </div>
            <div className="debt-summary-col debt-summary-col--center">
              <span className="debt-summary-label">Monthly</span>
              <span className="debt-summary-value">{fmt(totalMonthly)}</span>
            </div>
            <div className="debt-summary-col debt-summary-col--right">
              <span className="debt-summary-label">Avg Rate</span>
              <span className="debt-summary-value">{fmtRate(weightedRate)}</span>
            </div>
          </div>
          {totalOriginal > 0 && (
            <div className="debt-progress-wrap">
              <div className="debt-progress-track">
                <div className="debt-progress-fill" style={{ width: `${overallProgress}%` }} />
              </div>
              <span className="debt-progress-label">{overallProgress.toFixed(0)}% paid off</span>
            </div>
          )}
        </div>
      )}

      {/* ── Add button ── */}
      <button className="debt-add-btn" onClick={openAdd}>
        <FontAwesomeIcon icon={faPlus} /> Add Loan
      </button>

      {/* ── Empty state ── */}
      {loans.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <span className="empty-text">No loans added yet</span>
          </div>
        </div>
      )}

      {/* ── Active loans ── */}
      {activeLoans.map(loan => <LoanCard key={loan.id} loan={loan} onEdit={openEdit} onDelete={handleDelete} />)}

      {/* ── Paid off loans ── */}
      {paidLoans.length > 0 && (
        <>
          <div className="debt-section-label">Paid Off</div>
          {paidLoans.map(loan => <LoanCard key={loan.id} loan={loan} onEdit={openEdit} onDelete={handleDelete} />)}
        </>
      )}

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-sheet debt-modal" onClick={e => e.stopPropagation()}>
            <span className="modal-title">{editing != null ? 'Edit Loan' : 'Add Loan'}</span>

            <div className="debt-form">
              {/* Name */}
              <div className="debt-form-group">
                <label className="debt-form-label">Loan Name</label>
                <input className="text-input" placeholder="e.g. Direct Subsidized Loan" value={form.name} onChange={e => setField('name', e.target.value)} />
              </div>

              {/* Type + Status */}
              <div className="input-row">
                <div className="debt-form-group" style={{ flex: 1 }}>
                  <label className="debt-form-label">Type</label>
                  <select className="text-input" value={form.loan_type} onChange={e => setField('loan_type', e.target.value)}>
                    {LOAN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="debt-form-group" style={{ flex: 1 }}>
                  <label className="debt-form-label">Status</label>
                  <select className="text-input" value={form.status} onChange={e => setField('status', e.target.value)}>
                    {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Amounts */}
              <div className="input-row">
                <div className="debt-form-group" style={{ flex: 1 }}>
                  <label className="debt-form-label">Original Amount</label>
                  <div className="debt-field-prefix-wrap">
                    <span className="debt-field-prefix">$</span>
                    <input className="text-input debt-input-prefixed" type="number" min="0" step="0.01" placeholder="0.00" value={form.original_amount} onChange={e => setField('original_amount', e.target.value)} />
                  </div>
                </div>
                <div className="debt-form-group" style={{ flex: 1 }}>
                  <label className="debt-form-label">Current Balance</label>
                  <div className="debt-field-prefix-wrap">
                    <span className="debt-field-prefix">$</span>
                    <input className="text-input debt-input-prefixed" type="number" min="0" step="0.01" placeholder="0.00" value={form.current_balance} onChange={e => setField('current_balance', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Rate + Term */}
              <div className="input-row">
                <div className="debt-form-group" style={{ flex: 1 }}>
                  <label className="debt-form-label">Interest Rate (APR)</label>
                  <div className="debt-field-suffix-wrap">
                    <input className="text-input debt-input-suffixed" type="number" min="0" max="100" step="0.001" placeholder="0.000" value={form.interest_rate} onChange={e => setField('interest_rate', e.target.value)} />
                    <span className="debt-field-suffix">%</span>
                  </div>
                </div>
                <div className="debt-form-group" style={{ flex: 1 }}>
                  <label className="debt-form-label">Term (months)</label>
                  <input className="text-input" type="number" min="1" placeholder="120" value={form.term_months} onChange={e => setField('term_months', e.target.value)} />
                </div>
              </div>

              {/* Payment */}
              <div className="debt-form-group">
                <label className="debt-form-label">Monthly Payment <span className="debt-form-optional">(optional — leave blank to calculate)</span></label>
                <div className="debt-field-prefix-wrap">
                  <span className="debt-field-prefix">$</span>
                  <input className="text-input debt-input-prefixed" type="number" min="0" step="0.01" placeholder="auto" value={form.monthly_payment} onChange={e => setField('monthly_payment', e.target.value)} />
                </div>
              </div>

              {/* Start Date */}
              <div className="debt-form-group">
                <label className="debt-form-label">Start Date</label>
                <input className="text-input" type="date" value={form.start_date} onChange={e => setField('start_date', e.target.value)} />
              </div>

              {/* Subsidized note */}
              {form.loan_type === 'subsidized' && (form.status === 'in_school' || form.status === 'grace' || form.status === 'deferment') && (
                <div className="debt-info-note">
                  <FontAwesomeIcon icon={faTriangleExclamation} style={{ fontSize: 12 }} />
                  Interest does not accrue for subsidized loans while {form.status === 'in_school' ? 'in school' : form.status === 'grace' ? 'in grace period' : 'in deferment'}.
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={!formValid}>
                {editing != null ? 'Save' : 'Add Loan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Loan Card ────────────────────────────────────────────────────

function LoanCard({ loan, onEdit, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const balance    = parseFloat(loan.current_balance);
  const original   = parseFloat(loan.original_amount);
  const rate       = parseFloat(loan.interest_rate);
  const paidPct    = original > 0 ? Math.max(0, Math.min(100, ((original - balance) / original) * 100)) : 0;
  const accruing   = isAccruing(loan);
  const dailyInt   = accruing ? balance * (rate / 100 / 365) : 0;
  const monthlyInt = accruing ? balance * (rate / 100 / 12) : 0;
  const pmt        = effectivePayment(loan);
  const months     = loan.status === 'paid_off' ? 0 : monthsToPayoff(balance, rate, pmt);
  const payoffDate = loan.status === 'paid_off' ? 'Paid off' : payoffDateStr(months);
  const totalInt   = loan.status === 'paid_off' ? 0 : totalInterestRemaining(balance, rate, pmt, months);
  const isPaidOff  = loan.status === 'paid_off';

  const typeStyle   = TYPE_COLORS[loan.loan_type]   || TYPE_COLORS.other;
  const statusStyle = STATUS_COLORS[loan.status] || STATUS_COLORS.repayment;

  return (
    <div className={`debt-card${isPaidOff ? ' debt-card--paid' : ''}`}>
      {/* Header row */}
      <div className="debt-card-header">
        <span className="debt-card-name">{loan.name}</span>
        <div className="debt-card-actions">
          <button className="debt-icon-btn" onClick={() => onEdit(loan)} title="Edit"><FontAwesomeIcon icon={faPen} /></button>
          {confirmDelete
            ? <button className="debt-icon-btn debt-icon-btn--danger" onClick={() => onDelete(loan.id)} title="Confirm delete">Confirm</button>
            : <button className="debt-icon-btn" onClick={() => setConfirmDelete(true)} title="Delete"><FontAwesomeIcon icon={faTrashCan} /></button>
          }
        </div>
      </div>

      {/* Badges */}
      <div className="debt-badges">
        <span className="debt-badge" style={{ background: typeStyle.bg, color: typeStyle.text, borderColor: typeStyle.border }}>
          {LOAN_TYPES.find(t => t.value === loan.loan_type)?.label || loan.loan_type}
        </span>
        <span className="debt-badge" style={{ background: statusStyle.bg, color: statusStyle.text, borderColor: 'transparent' }}>
          {STATUSES.find(s => s.value === loan.status)?.label || loan.status}
        </span>
      </div>

      {/* Balance */}
      <div className="debt-balance">{fmt(balance)}</div>

      {/* Progress bar */}
      <div className="debt-card-progress">
        <div className="debt-progress-track">
          <div className="debt-progress-fill" style={{ width: `${paidPct}%` }} />
        </div>
        <span className="debt-progress-label">{paidPct.toFixed(0)}% of {fmt(original)} paid</span>
      </div>

      {!isPaidOff && (
        <div className="debt-stats-grid">
          <div className="debt-stat">
            <span className="debt-stat-label">APR</span>
            <span className="debt-stat-value">{fmtRate(rate)}</span>
          </div>
          <div className="debt-stat">
            <span className="debt-stat-label">Monthly pmt</span>
            <span className="debt-stat-value">{fmt(pmt)}</span>
          </div>
          <div className="debt-stat">
            <span className="debt-stat-label">Daily interest</span>
            <span className="debt-stat-value">
              {accruing ? fmt(dailyInt) : <span style={{ color: 'var(--green)', fontWeight: 700 }}>$0.00</span>}
            </span>
          </div>
          <div className="debt-stat">
            <span className="debt-stat-label">Monthly interest</span>
            <span className="debt-stat-value">
              {accruing ? fmt(monthlyInt) : <span style={{ color: 'var(--green)', fontWeight: 700 }}>$0.00</span>}
            </span>
          </div>
          <div className="debt-stat">
            <span className="debt-stat-label">Payoff</span>
            <span className="debt-stat-value">{payoffDate ?? '—'}</span>
          </div>
          <div className="debt-stat">
            <span className="debt-stat-label">Total interest</span>
            <span className="debt-stat-value" style={{ color: 'var(--red)' }}>{totalInt != null ? fmt(totalInt) : '—'}</span>
          </div>
        </div>
      )}

      {!accruing && !isPaidOff && (
        <div className="debt-info-note" style={{ margin: '8px 0 0' }}>
          <FontAwesomeIcon icon={faTriangleExclamation} style={{ fontSize: 12 }} />
          No interest accruing — subsidized loan in {STATUSES.find(s => s.value === loan.status)?.label.toLowerCase()}.
        </div>
      )}
    </div>
  );
}
