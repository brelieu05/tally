import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faScissors, faLink, faCheck } from '@fortawesome/free-solid-svg-icons';
import { faTrashCan } from '@fortawesome/free-regular-svg-icons';

const TIP_PRESETS = [15, 18, 20];

function encodeState(state) {
  return btoa(encodeURIComponent(JSON.stringify(state)));
}

function decodeState(str) {
  try {
    return JSON.parse(decodeURIComponent(atob(str)));
  } catch {
    return null;
  }
}

function loadFromUrl() {
  const param = new URLSearchParams(window.location.search).get('d');
  if (!param) return null;
  return decodeState(param);
}

export default function BillSplitter({ embedded = false }) {
  const initial = loadFromUrl();

  const [people, setPeople]       = useState(initial?.people   ?? []);
  const [items, setItems]         = useState(initial?.items    ?? []);
  const [tax, setTax]             = useState(initial?.tax      ?? '7.25');
  const [taxMode, setTaxMode]     = useState(initial?.taxMode  ?? '%');
  const [tip, setTip]             = useState(initial?.tip      ?? '');
  const [tipMode, setTipMode]     = useState(initial?.tipMode  ?? '%');
  const [newPerson, setNewPerson] = useState('');
  const [newName, setNewName]     = useState('');
  const [newPrice, setNewPrice]   = useState('');
  const [copied, setCopied]       = useState(false);

  // ── People ────────────────────────────────────────────────────
  function addPerson() {
    const name = newPerson.trim();
    if (!name || people.includes(name)) return;
    setPeople(prev => [...prev, name]);
    setNewPerson('');
  }

  function removePerson(name) {
    setPeople(prev => prev.filter(p => p !== name));
    setItems(prev => prev.map(item => ({
      ...item,
      assignedTo: item.assignedTo.filter(p => p !== name),
    })));
  }

  // ── Items ─────────────────────────────────────────────────────
  function addItem() {
    const name = newName.trim();
    const price = parseFloat(newPrice);
    if (!name || isNaN(price) || price <= 0) return;
    setItems(prev => [...prev, { id: Date.now(), name, price, assignedTo: [] }]);
    setNewName('');
    setNewPrice('');
  }

  function removeItem(id) {
    setItems(prev => prev.filter(item => item.id !== id));
  }

  function toggleAssignment(itemId, person) {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const has = item.assignedTo.includes(person);
      return {
        ...item,
        assignedTo: has
          ? item.assignedTo.filter(p => p !== person)
          : [...item.assignedTo, person],
      };
    }));
  }

  // ── Share ─────────────────────────────────────────────────────
  function copyShareLink() {
    const state = { people, items, tax, taxMode, tip, tipMode };
    const encoded = encodeState(state);
    const url = `${window.location.origin}/split?d=${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Calculations ──────────────────────────────────────────────
  const subtotal   = items.reduce((s, i) => s + i.price, 0);
  const taxAmt     = taxMode === '$'
    ? (parseFloat(tax) || 0)
    : subtotal * (parseFloat(tax) || 0) / 100;
  const tipAmt     = tipMode === '$'
    ? (parseFloat(tip) || 0)
    : subtotal * (parseFloat(tip) || 0) / 100;
  const grandTotal = subtotal + taxAmt + tipAmt;

  const personTotals = people.map(person => {
    const personSub = items.reduce((s, item) => {
      if (!item.assignedTo.includes(person) || item.assignedTo.length === 0) return s;
      return s + item.price / item.assignedTo.length;
    }, 0);
    const share     = subtotal > 0 ? personSub / subtotal : 0;
    const personTax = share * taxAmt;
    const personTip = share * tipAmt;
    return {
      name: person,
      subtotal: personSub,
      tax: personTax,
      tip: personTip,
      total: personSub + personTax + personTip,
    };
  });

  const showSummary = people.length > 0 && subtotal > 0;
  const hasContent  = items.length > 0 || people.length > 0;

  const shareBtn = (
    <button
      className={`split-share-btn ${copied ? 'copied' : ''}`}
      onClick={copyShareLink}
      disabled={!hasContent}
      title="Copy share link"
    >
      <FontAwesomeIcon icon={copied ? faCheck : faLink} />
      {copied ? 'Copied!' : 'Share'}
    </button>
  );

  const content = (
    <>
      {/* ── People ─────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">People</span>
          {people.length > 0 && <span className="badge">{people.length}</span>}
        </div>
        <div className="card-body">
          <div className="split-row">
            <input
              className="text-input"
              placeholder="Name"
              value={newPerson}
              onChange={e => setNewPerson(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPerson()}
            />
            <button className="split-add-btn" onClick={addPerson} disabled={!newPerson.trim()}>
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </div>
          {people.length > 0 && (
            <div className="split-chips">
              {people.map(p => (
                <span key={p} className="split-chip">
                  {p}
                  <button className="chip-remove" onClick={() => removePerson(p)}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Items ──────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Items</span>
          {items.length > 0 && <span className="badge">{items.length}</span>}
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="split-row">
            <input
              className="text-input"
              placeholder="Item name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && document.getElementById('sp-price').focus()}
              style={{ flex: 2 }}
            />
            <div className="split-price-wrap">
              <span className="split-price-sym">$</span>
              <input
                id="sp-price"
                className="text-input split-price-input"
                placeholder="0.00"
                type="number"
                min="0"
                step="0.01"
                value={newPrice}
                onChange={e => setNewPrice(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addItem()}
              />
            </div>
            <button
              className="split-add-btn"
              onClick={addItem}
              disabled={!newName.trim() || !newPrice}
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </div>

          {items.map(item => (
            <div key={item.id} className="split-item">
              <div className="split-item-top">
                <span className="split-item-name">{item.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="split-item-price">${item.price.toFixed(2)}</span>
                  <button className="delete-btn" onClick={() => removeItem(item.id)}>
                    <FontAwesomeIcon icon={faTrashCan} />
                  </button>
                </div>
              </div>
              {people.length > 0 && (
                <div className="split-assign-row">
                  {people.map(p => (
                    <button
                      key={p}
                      className={`split-assign-chip ${item.assignedTo.includes(p) ? 'assigned' : ''}`}
                      onClick={() => toggleAssignment(item.id, p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Tax & Tip ──────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Tax & Tip</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="split-row" style={{ gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label className="split-label" style={{ marginBottom: 0 }}>Tax</label>
                <div className="split-mode-toggle">
                  <button
                    className={`split-mode-btn ${taxMode === '%' ? 'active' : ''}`}
                    onClick={() => { setTaxMode('%'); setTax('7.25'); }}
                  >%</button>
                  <button
                    className={`split-mode-btn ${taxMode === '$' ? 'active' : ''}`}
                    onClick={() => { setTaxMode('$'); setTax(''); }}
                  >$</button>
                </div>
              </div>
              <div className="split-pct-wrap">
                {taxMode === '$' && <span className="split-price-sym">$</span>}
                <input
                  className={`text-input${taxMode === '$' ? ' split-price-input' : ''}`}
                  type="number"
                  min="0"
                  step={taxMode === '%' ? '0.1' : '0.01'}
                  placeholder="0"
                  value={tax}
                  onChange={e => setTax(e.target.value)}
                />
                {taxMode === '%' && <span className="split-pct-sym">%</span>}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label className="split-label" style={{ marginBottom: 0 }}>Tip</label>
                <div className="split-mode-toggle">
                  <button
                    className={`split-mode-btn ${tipMode === '%' ? 'active' : ''}`}
                    onClick={() => { setTipMode('%'); setTip(''); }}
                  >%</button>
                  <button
                    className={`split-mode-btn ${tipMode === '$' ? 'active' : ''}`}
                    onClick={() => { setTipMode('$'); setTip(''); }}
                  >$</button>
                </div>
              </div>
              <div className="split-pct-wrap">
                {tipMode === '$' && <span className="split-price-sym">$</span>}
                <input
                  className={`text-input${tipMode === '$' ? ' split-price-input' : ''}`}
                  type="number"
                  min="0"
                  step={tipMode === '%' ? '1' : '0.01'}
                  placeholder="0"
                  value={tip}
                  onChange={e => setTip(e.target.value)}
                />
                {tipMode === '%' && <span className="split-pct-sym">%</span>}
              </div>
            </div>
          </div>

          {tipMode === '%' && <div className="split-tip-presets">
            {TIP_PRESETS.map(pct => (
              <button
                key={pct}
                className={`split-preset-btn ${tip === String(pct) ? 'active' : ''}`}
                onClick={() => setTip(tip === String(pct) ? '' : String(pct))}
              >
                {pct}%
              </button>
            ))}
          </div>}

          {subtotal > 0 && (
            <div className="split-totals-grid">
              <span className="split-totals-label">Subtotal</span>
              <span className="split-totals-value">${subtotal.toFixed(2)}</span>
              {taxAmt > 0 && (
                <>
                  <span className="split-totals-label">Tax {taxMode === '%' ? `(${tax}%)` : '(flat)'}</span>
                  <span className="split-totals-value">+${taxAmt.toFixed(2)}</span>
                </>
              )}
              {tipAmt > 0 && (
                <>
                  <span className="split-totals-label">Tip {tipMode === '%' ? `(${tip}%)` : '(flat)'}</span>
                  <span className="split-totals-value">+${tipAmt.toFixed(2)}</span>
                </>
              )}
              <span className="split-grand-label">Total</span>
              <span className="split-grand-value">${grandTotal.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Summary ────────────────────────────────────────── */}
      {showSummary && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Summary</span>
            <FontAwesomeIcon icon={faScissors} style={{ color: 'var(--text-muted)', fontSize: 14 }} />
          </div>
          {personTotals.map(p => (
            <div key={p.name} className="split-person-row">
              <div className="split-person-avatar">{p.name[0].toUpperCase()}</div>
              <div className="split-person-info">
                <div className="split-person-name">{p.name}</div>
                <div className="split-person-breakdown">
                  {p.subtotal > 0 ? (
                    <>
                      <span>${p.subtotal.toFixed(2)} items</span>
                      {p.tax > 0 && <span>· +${p.tax.toFixed(2)} tax</span>}
                      {p.tip > 0 && <span>· +${p.tip.toFixed(2)} tip</span>}
                    </>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>no items assigned</span>
                  )}
                </div>
              </div>
              <div className="split-person-total">${p.total.toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Share button (embedded bottom) ─────────────────── */}
      {embedded && <div style={{ display: 'flex', justifyContent: 'center' }}>{shareBtn}</div>}
    </>
  );

  if (embedded) return content;

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">
          <img src="/favicon.svg" className="header-logo" alt="" />
          <span className="header-accent">tally</span>
          <span className="header-divider">/</span>
          split
        </span>
        {shareBtn}
      </header>
      <main className="app-main">{content}</main>
    </div>
  );
}
