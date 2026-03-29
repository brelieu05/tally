import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faScissors, faLink, faCheck, faCamera, faXmark, faReceipt } from '@fortawesome/free-solid-svg-icons';
import { faTrashCan } from '@fortawesome/free-regular-svg-icons';

const TIP_PRESETS = [15, 18, 20];

// Extract bill ID from path: /split/:id
function getBillId() {
  const parts = window.location.pathname.split('/');
  return parts[2] || null;
}

export default function BillSplitter({ embedded = false, onDirtyChange, categories = [], token = '', accountId = null, onExpenseAdded, onBillLoaded }) {
  const MY_NAME  = import.meta.env.VITE_MY_NAME  || '';
  const MY_VENMO = import.meta.env.VITE_MY_VENMO || '';
  const MY_ZELLE = import.meta.env.VITE_MY_ZELLE || '';

  const [billName, setBillName]   = useState('');
  const [splitCategory, setSplitCategory] = useState('');

  const [people, setPeople]       = useState([MY_NAME]);
  const [items, setItems]         = useState([]);
  const [tax, setTax]             = useState('7.25');
  const [taxMode, setTaxMode]     = useState('%');
  const [tip, setTip]             = useState('');
  const [tipMode, setTipMode]     = useState('%');
  const [discount, setDiscount]           = useState('');
  const [discountMode, setDiscountMode]   = useState('%');
  const [showDiscount, setShowDiscount]   = useState(false);
  const [paidBy, setPaidBy]   = useState('');
  const [venmo, setVenmo]     = useState('');
  const [zelle, setZelle]     = useState('');
  const [newPerson, setNewPerson] = useState('');
  const [newName, setNewName]     = useState('');
  const [newPrice, setNewPrice]   = useState('');
  const [shareId, setShareId]       = useState(getBillId); // reuse if already shared
  const [splitExpenseId, setSplitExpenseId] = useState(null); // expense created from this split
  const [copied, setCopied]         = useState(false);
  const [sharing, setSharing]       = useState(false);
  const [loadError, setLoadError]   = useState(false);

  // ── Receipt scanner ───────────────────────────────────────────
  const [scannerOpen, setScannerOpen]   = useState(false);
  const [scanImage, setScanImage]       = useState(null); // { dataUrl, base64, mimeType }
  const [scanLoading, setScanLoading]   = useState(false);
  const [scanResult, setScanResult]     = useState(null);
  const [scanError, setScanError]       = useState('');
  const fileInputRef                    = useRef(null);

  useEffect(() => {
    onDirtyChange?.(billName !== '' || people.length > 1 || items.length > 0);
  }, [billName, people, items]);

  useEffect(() => {
    if (paidBy === MY_NAME) {
      if (MY_VENMO) setVenmo(MY_VENMO);
      if (MY_ZELLE) setZelle(MY_ZELLE);
    } else {
      setVenmo('');
      setZelle('');
    }
  }, [paidBy]);

  // Load bill from server if URL has an ID
  useEffect(() => {
    const id = getBillId();
    if (!id) return;
    fetch(`/api/split/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        setBillName(data.billName ?? '');
        setPeople(data.people   ?? []);
        setItems(data.items     ?? []);
        setTax(data.tax         ?? '7.25');
        setTaxMode(data.taxMode ?? '%');
        setTip(data.tip                   ?? '');
        setTipMode(data.tipMode           ?? '%');
        setDiscount(data.discount         ?? '');
        setDiscountMode(data.discountMode ?? '%');
        setPaidBy(data.paidBy ?? '');
        setVenmo(data.venmo   ?? '');
        setZelle(data.zelle   ?? '');
        onBillLoaded?.();
      })
      .catch(() => setLoadError(true));
  }, []);

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

  // ── Receipt scanner helpers ───────────────────────────────────
  function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const base64 = dataUrl.split(',')[1];
      setScanImage({ dataUrl, base64, mimeType: file.type });
      setScanResult(null);
      setScanError('');
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  }

  async function scanReceipt() {
    if (!scanImage) return;
    setScanLoading(true);
    setScanError('');
    try {
      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: scanImage.base64, mimeType: scanImage.mimeType }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setScanResult(data);
    } catch (err) {
      setScanError(err.message || 'Failed to scan receipt');
    } finally {
      setScanLoading(false);
    }
  }

  function applyScannedItems() {
    if (!scanResult) return;
    if (scanResult.billName && !billName) setBillName(scanResult.billName);
    if (scanResult.items?.length) {
      setItems(prev => [
        ...prev,
        ...scanResult.items.map(item => ({
          id: Date.now() + Math.random(),
          name: item.name,
          price: parseFloat(item.price) || 0,
          assignedTo: [],
        })),
      ]);
    }
    if (scanResult.tax) { setTax(scanResult.tax); setTaxMode(scanResult.taxMode || '$'); }
    if (scanResult.tip) { setTip(scanResult.tip); setTipMode(scanResult.tipMode || '$'); }
    setScannerOpen(false);
    setScanImage(null);
    setScanResult(null);
    setScanError('');
  }

  function closeScanner() {
    setScannerOpen(false);
    setScanImage(null);
    setScanResult(null);
    setScanError('');
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

  // ── Auto-save when share link exists ──────────────────────────
  useEffect(() => {
    if (!shareId) return;
    const payload = { billName, people, items, tax, taxMode, tip, tipMode, discount, discountMode, paidBy, venmo, zelle };
    const timer = setTimeout(() => {
      fetch(`/api/split/${shareId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [shareId, billName, people, items, tax, taxMode, tip, tipMode, discount, discountMode, paidBy, venmo, zelle]);

  // ── Share ─────────────────────────────────────────────────────
  async function copyShareLink() {
    setSharing(true);
    try {
      const payload = { billName, people, items, tax, taxMode, tip, tipMode, discount, discountMode, paidBy, venmo, zelle };
      let id = shareId;
      if (id) {
        // Update existing record
        const res = await fetch(`/api/split/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) id = null; // fallback to new if not found
      }
      if (!id) {
        const res = await fetch('/api/split', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        id = data.id;
        setShareId(id);
      }
      const url = `${window.location.origin}/split/${id}`;
      // Add or update expense for Brendan's share if he paid
      if (paidBy === MY_NAME && grandTotal > 0 && accountId && token) {
        const myTotal = personTotals.find(p => p.name === MY_NAME)?.total ?? grandTotal;
        const expPayload = {
          amount: parseFloat(myTotal.toFixed(2)),
          category: splitCategory,
          description: billName || 'Split bill',
          date: new Date().toISOString().slice(0, 10),
          type: 'expense',
          account_id: accountId,
        };
        if (splitExpenseId) {
          const res = await fetch(`/api/expenses/${splitExpenseId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(expPayload),
          });
          const updated = await res.json();
          if (!updated.error) onExpenseAdded?.(updated);
        } else {
          const res = await fetch('/api/expenses', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(expPayload),
          });
          const newExp = await res.json();
          if (!newExp.error) { setSplitExpenseId(newExp.id); onExpenseAdded?.(newExp); }
        }
      }
      onDirtyChange?.(false);
      let copyOk = false;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try { await navigator.clipboard.writeText(url); copyOk = true; } catch (_) {}
      }
      if (!copyOk) {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { copyOk = document.execCommand('copy'); } catch (_) {}
        document.body.removeChild(ta);
      }
      if (!copyOk && navigator.share) {
        try {
          await navigator.share({ title: billName || 'Split bill', url });
          copyOk = true;
        } catch (_) {}
      }
      if (copyOk) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } else {
        prompt('Copy this link:', url);
      }
    } finally {
      setSharing(false);
    }
  }

  // ── Calculations ──────────────────────────────────────────────
  const subtotal     = items.reduce((s, i) => s + i.price, 0);
  const discountAmt  = Math.min(
    discountMode === '$'
      ? (parseFloat(discount) || 0)
      : subtotal * (parseFloat(discount) || 0) / 100,
    subtotal
  );
  const discounted   = subtotal - discountAmt;
  const taxAmt       = taxMode === '$'
    ? (parseFloat(tax) || 0)
    : discounted * (parseFloat(tax) || 0) / 100;
  const tipAmt       = tipMode === '$'
    ? (parseFloat(tip) || 0)
    : discounted * (parseFloat(tip) || 0) / 100;
  const grandTotal   = discounted + taxAmt + tipAmt;

  const personTotals = people.map(person => {
    const personSub = items.reduce((s, item) => {
      if (!item.assignedTo.includes(person) || item.assignedTo.length === 0) return s;
      return s + item.price / item.assignedTo.length;
    }, 0);
    const share           = subtotal > 0 ? personSub / subtotal : 0;
    const personDiscount  = share * discountAmt;
    const personDiscounted = personSub - personDiscount;
    const personTax       = share * taxAmt;
    const personTip       = share * tipAmt;
    return {
      name: person,
      subtotal: personSub,
      discount: personDiscount,
      tax: personTax,
      tip: personTip,
      total: personDiscounted + personTax + personTip,
    };
  });

  const showSummary = people.length > 0 && subtotal > 0;
  const hasContent  = items.length > 0 || people.length > 0;

  const shareBtn = (
    <button
      className={`split-share-btn ${copied ? 'copied' : ''}`}
      onClick={copyShareLink}
      disabled={!hasContent || sharing || copied}
      title="Copy share link"
    >
      <FontAwesomeIcon icon={copied ? faCheck : faLink} />
      {sharing ? 'Saving…' : copied ? 'Copied!' : 'Share'}
    </button>
  );

  const content = (
    <>
      {loadError && (
        <div className="split-load-error">
          Bill not found — it may have expired or the link is invalid.
        </div>
      )}
      <input
        className="split-name-input"
        placeholder="Name this split…"
        value={billName}
        onChange={e => setBillName(e.target.value)}
      />
      {/* ── People ─────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">People</span>
          {people.length > 0 && <span className="badge" style={{ marginLeft: 6 }}>{people.length}</span>}
          <div style={{ marginLeft: 'auto' }}>{shareBtn}</div>
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

      {/* ── Receipt scanner modal ──────────────────────────── */}
      {scannerOpen && (
        <div className="receipt-overlay" onClick={closeScanner}>
          <div className="receipt-modal" onClick={e => e.stopPropagation()}>
            <div className="receipt-modal-header">
              <span><FontAwesomeIcon icon={faReceipt} style={{ marginRight: 8 }} />Scan Receipt</span>
              <button className="receipt-close-btn" onClick={closeScanner}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            {!scanImage ? (
              <label className="receipt-upload-area">
                <FontAwesomeIcon icon={faCamera} className="receipt-camera-icon" />
                <span className="receipt-upload-label">Take a photo or upload image</span>
                <span className="receipt-upload-hint">Supports JPG, PNG, WEBP</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageSelect}
                  style={{ display: 'none' }}
                />
              </label>
            ) : (
              <div className="receipt-preview-wrap">
                <img src={scanImage.dataUrl} className="receipt-preview-img" alt="Receipt preview" />
                <div className="receipt-preview-actions">
                  <button className="receipt-retake-btn" onClick={() => { setScanImage(null); setScanResult(null); setScanError(''); }}>
                    Retake
                  </button>
                  <button className="receipt-scan-btn" onClick={scanReceipt} disabled={scanLoading}>
                    {scanLoading ? (
                      <><span className="receipt-spinner" />Scanning…</>
                    ) : 'Scan'}
                  </button>
                </div>
              </div>
            )}

            {scanError && <div className="receipt-scan-error">{scanError}</div>}

            {scanResult && (
              <div className="receipt-results">
                <div className="receipt-results-title">
                  {scanResult.billName && <strong>{scanResult.billName}</strong>}
                  <span>{scanResult.items?.length || 0} item{scanResult.items?.length !== 1 ? 's' : ''} found</span>
                </div>
                <div className="receipt-results-list">
                  {scanResult.items?.map((item, i) => (
                    <div key={i} className="receipt-result-row">
                      <span className="receipt-result-name">{item.name}</span>
                      <span className="receipt-result-price">${parseFloat(item.price).toFixed(2)}</span>
                    </div>
                  ))}
                  {(scanResult.tax || scanResult.tip) && (
                    <div className="receipt-result-extras">
                      {scanResult.tax && <span>Tax: ${parseFloat(scanResult.tax).toFixed(2)}</span>}
                      {scanResult.tip && <span>Tip: ${parseFloat(scanResult.tip).toFixed(2)}</span>}
                    </div>
                  )}
                </div>
                <button className="receipt-apply-btn" onClick={applyScannedItems}>
                  Apply to Bill
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Items ──────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Items</span>
          {items.length > 0 && <span className="badge">{items.length}</span>}
          <button
            className="receipt-scan-trigger"
            onClick={() => setScannerOpen(true)}
            title="Scan receipt"
          >
            <FontAwesomeIcon icon={faCamera} />
          </button>
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
          <div className="split-row" style={{ gap: 12, alignItems: 'flex-start' }}>
            {/* Tax */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label className="split-label" style={{ marginBottom: 0 }}>Tax</label>
                <div className="split-mode-toggle">
                  <button className={`split-mode-btn ${taxMode === '%' ? 'active' : ''}`} onClick={() => { setTaxMode('%'); setTax('7.25'); }}>%</button>
                  <button className={`split-mode-btn ${taxMode === '$' ? 'active' : ''}`} onClick={() => { setTaxMode('$'); setTax(''); }}>$</button>
                </div>
              </div>
              <div className="split-pct-wrap">
                {taxMode === '$' && <span className="split-price-sym">$</span>}
                <input
                  className={`text-input${taxMode === '$' ? ' split-price-input' : ''}`}
                  type="number" min="0" step={taxMode === '%' ? '0.1' : '0.01'} placeholder="0"
                  value={tax} onChange={e => setTax(e.target.value)}
                />
                {taxMode === '%' && <span className="split-pct-sym">%</span>}
              </div>
            </div>
            {/* Tip */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label className="split-label" style={{ marginBottom: 0 }}>Tip</label>
                <div className="split-mode-toggle">
                  <button className={`split-mode-btn ${tipMode === '%' ? 'active' : ''}`} onClick={() => { setTipMode('%'); setTip(''); }}>%</button>
                  <button className={`split-mode-btn ${tipMode === '$' ? 'active' : ''}`} onClick={() => { setTipMode('$'); setTip(''); }}>$</button>
                </div>
              </div>
              <div className="split-pct-wrap">
                {tipMode === '$' && <span className="split-price-sym">$</span>}
                <input
                  className={`text-input${tipMode === '$' ? ' split-price-input' : ''}`}
                  type="number" min="0" step={tipMode === '%' ? '1' : '0.01'} placeholder="0"
                  value={tip} onChange={e => setTip(e.target.value)}
                />
                {tipMode === '%' && <span className="split-pct-sym">%</span>}
              </div>
              {tipMode === '%' && (
                <div className="split-tip-presets-inline">
                  {TIP_PRESETS.map(pct => (
                    <button
                      key={pct}
                      className={`split-preset-sm ${tip === String(pct) ? 'active' : ''}`}
                      onClick={() => setTip(tip === String(pct) ? '' : String(pct))}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {subtotal > 0 && (
            <div className="split-totals-grid">
              <span className="split-totals-label">Subtotal</span>
              <span className="split-totals-value">${subtotal.toFixed(2)}</span>
              {discountAmt > 0 && (
                <>
                  <span className="split-totals-label">Discount {discountMode === '%' ? `(${discount}%)` : '(flat)'}</span>
                  <span className="split-totals-value split-totals-discount">−${discountAmt.toFixed(2)}</span>
                </>
              )}
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

      {/* ── Discount ───────────────────────────────────────── */}
      <div className="card">
        <button className="split-discount-toggle card-header" style={{ width: '100%' }} onClick={() => setShowDiscount(v => !v)}>
          <span className="card-title">{showDiscount ? '▾' : '▸'} Discount</span>
          {discountAmt > 0 && <span className="split-discount-badge">−${discountAmt.toFixed(2)}</span>}
        </button>
        {showDiscount && (
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
              <div className="split-mode-toggle">
                <button className={`split-mode-btn ${discountMode === '%' ? 'active' : ''}`} onClick={() => { setDiscountMode('%'); setDiscount(''); }}>%</button>
                <button className={`split-mode-btn ${discountMode === '$' ? 'active' : ''}`} onClick={() => { setDiscountMode('$'); setDiscount(''); }}>$</button>
              </div>
            </div>
            <div className="split-pct-wrap">
              {discountMode === '$' && <span className="split-price-sym">$</span>}
              <input
                className={`text-input${discountMode === '$' ? ' split-price-input' : ''}`}
                type="number" min="0" step={discountMode === '%' ? '0.1' : '0.01'} placeholder="0"
                value={discount} onChange={e => setDiscount(e.target.value)}
              />
              {discountMode === '%' && <span className="split-pct-sym">%</span>}
            </div>
          </div>
        )}
      </div>

      {/* ── Paid by ────────────────────────────────────────── */}
      {people.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Paid by</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="split-chips" style={{ marginTop: 0 }}>
              {people.map(p => (
                <button
                  key={p}
                  className={`split-chip split-chip-btn ${paidBy === p ? 'active' : ''}`}
                  onClick={() => setPaidBy(paidBy === p ? '' : p)}
                >
                  {p}
                </button>
              ))}
            </div>
            {paidBy === MY_NAME && categories.length > 0 && (
              <div className="category-scroll" style={{ marginTop: 4 }}>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`category-pill ${splitCategory === cat.name ? 'selected' : ''}`}
                    onClick={() => setSplitCategory(prev => prev === cat.name ? '' : cat.name)}
                  >
                    <span
                      className="cat-dot"
                      style={{ background: splitCategory === cat.name ? 'rgba(255,255,255,0.8)' : cat.color }}
                    />
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
            {paidBy && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="split-pct-wrap">
                  <span className="split-payment-prefix">Venmo</span>
                  <input
                    className="text-input split-payment-input"
                    placeholder="@username"
                    value={venmo}
                    onChange={e => setVenmo(e.target.value)}
                  />
                </div>
                <div className="split-pct-wrap">
                  <span className="split-payment-prefix">Zelle</span>
                  <input
                    className="text-input split-payment-input"
                    placeholder="phone or email"
                    value={zelle}
                    onChange={e => setZelle(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Summary ────────────────────────────────────────── */}
      {showSummary && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Summary</span>
            <FontAwesomeIcon icon={faScissors} style={{ color: 'var(--text-muted)', fontSize: 14 }} />
          </div>
          {personTotals.map(p => {
            const isPayer = paidBy === p.name;
            return (
              <div key={p.name} className={`split-person-row ${isPayer ? 'split-person-payer' : ''}`}>
                <div className="split-person-avatar">{p.name[0].toUpperCase()}</div>
                <div className="split-person-info">
                  <div className="split-person-name">
                    {p.name}
                    {isPayer && <span className="split-payer-tag">paid</span>}
                  </div>
                  <div className="split-person-breakdown">
                    {p.subtotal > 0 ? (
                      <>
                        <span>${p.subtotal.toFixed(2)} items</span>
                        {p.discount > 0 && <span>· −${p.discount.toFixed(2)} disc</span>}
                        {p.tax > 0 && <span>· +${p.tax.toFixed(2)} tax</span>}
                        {p.tip > 0 && <span>· +${p.tip.toFixed(2)} tip</span>}
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>no items assigned</span>
                    )}
                  </div>
                  {!isPayer && paidBy && (venmo || zelle) && p.total > 0 && (
                    <div className="split-pay-links">
                      {venmo && (
                        <a
                          className="split-pay-btn split-pay-venmo"
                          href={`https://venmo.com/${venmo.replace(/^@/, '')}?txn=pay&amount=${p.total.toFixed(2)}&note=Bill%20split`}
                          target="_blank" rel="noreferrer"
                        >
                          Venmo {venmo.startsWith('@') ? venmo : `@${venmo}`}
                        </a>
                      )}
                      {zelle && (
                        <span className="split-pay-btn split-pay-zelle">
                          Zelle {zelle}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className={`split-person-total ${isPayer ? 'split-payer-total' : ''}`}>
                  {isPayer ? 'covered' : `$${p.total.toFixed(2)}`}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </>
  );

  if (embedded) return content;

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">
          <a className="header-home-btn" href="/">
            <img src="/favicon.svg" className="header-logo" alt="" />
            <span className="header-accent">tally</span>
          </a>
          <span className="header-divider">/</span>
          <a className="header-section-btn" href="/?tab=split">split</a>
        </span>
      </header>
      <main className="app-main">{content}</main>
    </div>
  );
}
