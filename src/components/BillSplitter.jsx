import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faScissors, faLink, faCheck, faCamera, faXmark, faReceipt, faUpload } from '@fortawesome/free-solid-svg-icons';
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
  const [showTaxTip, setShowTaxTip]       = useState(false);
  const [showDiscount, setShowDiscount]   = useState(false);
  const [paidBy, setPaidBy]   = useState('');
  const [venmo, setVenmo]     = useState('');
  const [zelle, setZelle]     = useState('');
  const [newPerson, setNewPerson] = useState('');
  const [newName, setNewName]     = useState('');
  const [newPrice, setNewPrice]   = useState('');
  // ── Saved contacts ────────────────────────────────────────
  const [savedContacts, setSavedContacts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('split_contacts') || '[]'); }
    catch { return []; }
  });
  const [savingContact, setSavingContact] = useState(null); // name of person whose save form is open
  const [saveVenmo, setSaveVenmo]         = useState('');
  const [saveZelle, setSaveZelle]         = useState('');

  const [paidStatus, setPaidStatus] = useState({}); // { [personName]: true } for people who paid

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
  const uploadInputRef                  = useRef(null);

  useEffect(() => {
    onDirtyChange?.(billName !== '' || people.length > 1 || items.length > 0);
  }, [billName, people, items]);

  useEffect(() => {
    if (paidBy === MY_NAME) {
      if (MY_VENMO) setVenmo(MY_VENMO);
      if (MY_ZELLE) setZelle(MY_ZELLE);
    } else if (paidBy) {
      const contact = savedContacts.find(c => c.name === paidBy);
      setVenmo(contact?.venmo || '');
      setZelle(contact?.zelle || '');
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
        const loadedTax = parseFloat(data.tax) || 0;
        const loadedTip = parseFloat(data.tip) || 0;
        if (loadedTax > 0 || loadedTip > 0) setShowTaxTip(true);
        if (parseFloat(data.discount) > 0) setShowDiscount(true);
        setPaidBy(data.paidBy ?? '');
        setVenmo(data.venmo   ?? '');
        setZelle(data.zelle   ?? '');
        setPaidStatus(data.paidStatus ?? {});
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
    if (savingContact === name) setSavingContact(null);
    setPeople(prev => prev.filter(p => p !== name));
    setItems(prev => prev.map(item => ({
      ...item,
      assignedTo: item.assignedTo.filter(p => p !== name),
    })));
  }

  // ── Saved contacts ────────────────────────────────────────────
  function persistContact(name, v, z) {
    setSavedContacts(prev => {
      const next = [...prev.filter(c => c.name !== name), { name, venmo: v.trim(), zelle: z.trim() }];
      localStorage.setItem('split_contacts', JSON.stringify(next));
      return next;
    });
    setSavingContact(null);
  }

  function removeContact(name) {
    setSavedContacts(prev => {
      const next = prev.filter(c => c.name !== name);
      localStorage.setItem('split_contacts', JSON.stringify(next));
      return next;
    });
  }

  function formatPhone(value) {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length === 0) return '';
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  function handleZelleChange(raw, setter) {
    // If it contains @, a letter before @, or non-digit non-formatting chars → treat as email, pass through
    const isEmail = raw.includes('@') || /[a-zA-Z]/.test(raw.replace(/^\+?[\d\s\-().]+$/, ''));
    if (isEmail) { setter(raw); return; }
    setter(formatPhone(raw));
  }

  function openSaveForm(name) {
    const existing = savedContacts.find(c => c.name === name);
    const v = existing?.venmo || '';
    setSaveVenmo(v && !v.startsWith('@') ? '@' + v : v);
    setSaveZelle(existing?.zelle || '');
    setSavingContact(prev => prev === name ? null : name);
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
  function preprocessImage(file, maxPx = 1800) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        // Grayscale + contrast boost via pixel manipulation
        const imageData = ctx.getImageData(0, 0, w, h);
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
          // Grayscale
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          // Contrast stretch: factor > 1 pushes darks darker and lights lighter
          const contrast = 1.4;
          const adjusted = Math.min(255, Math.max(0, contrast * (gray - 128) + 128));
          d[i] = d[i + 1] = d[i + 2] = adjusted;
        }
        ctx.putImageData(imageData, 0, 0);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        resolve({ dataUrl, base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
      };
      img.src = url;
    });
  }

  async function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setScanResult(null);
    setScanError('');
    const processed = await preprocessImage(file);
    setScanImage(processed);
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
    const payload = { billName, people, items, tax, taxMode, tip, tipMode, discount, discountMode, paidBy, venmo, zelle, paidStatus };
    const timer = setTimeout(() => {
      fetch(`/api/split/${shareId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [shareId, billName, people, items, tax, taxMode, tip, tipMode, discount, discountMode, paidBy, venmo, zelle, paidStatus]);

  // ── Share ─────────────────────────────────────────────────────
  async function copyShareLink() {
    setSharing(true);
    try {
      const payload = { billName, people, items, tax, taxMode, tip, tipMode, discount, discountMode, paidBy, venmo, zelle, paidStatus };
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
        window.history.replaceState(null, '', `/split/${id}`);
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
  const taxAmt       = showTaxTip
    ? (taxMode === '$' ? (parseFloat(tax) || 0) : discounted * (parseFloat(tax) || 0) / 100)
    : 0;
  const tipAmt       = showTaxTip
    ? (tipMode === '$' ? (parseFloat(tip) || 0) : discounted * (parseFloat(tip) || 0) / 100)
    : 0;
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
          {/* Name input with autocomplete */}
          <div className="split-row" style={{ position: 'relative' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                className="text-input"
                placeholder="Name"
                value={newPerson}
                onChange={e => setNewPerson(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPerson()}
                autoComplete="off"
                style={{ width: '100%' }}
              />
              {(() => {
                const suggestions = newPerson.trim().length > 0
                  ? savedContacts.filter(c =>
                      c.name.toLowerCase().includes(newPerson.toLowerCase()) &&
                      !people.includes(c.name)
                    )
                  : [];
                return suggestions.length > 0 ? (
                  <div className="contact-suggestions">
                    {suggestions.map(c => (
                      <button
                        key={c.name}
                        className="contact-suggestion-item"
                        onMouseDown={() => {
                          setPeople(prev => prev.includes(c.name) ? prev : [...prev, c.name]);
                          setNewPerson('');
                        }}
                      >
                        <span className="contact-suggestion-name">{c.name}</span>
                        {(c.venmo || c.zelle) && (
                          <span className="contact-suggestion-detail">
                            {c.venmo ? `@${c.venmo.replace(/^@/, '')}` : ''}{c.venmo && c.zelle ? ' · ' : ''}{c.zelle}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : null;
              })()}
            </div>
            <button className="split-add-btn" onClick={addPerson} disabled={!newPerson.trim()}>
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </div>
          {people.length > 0 && (
            <div className="split-chips">
              {people.map(p => {
                const isSaved = p === MY_NAME || savedContacts.some(c => c.name === p);
                return (
                <span
                  key={p}
                  className={`split-chip${!isSaved ? ' split-chip--unsaved' : ''}`}
                  onClick={() => p !== MY_NAME && openSaveForm(p)}
                  style={p !== MY_NAME ? { cursor: 'pointer' } : {}}
                >
                  {p}
                  <button className="chip-remove" onClick={e => { e.stopPropagation(); removePerson(p); }}>×</button>
                </span>
                );
              })}
            </div>
          )}
          {savingContact && (
            <div className="contact-save-form">
              <div className="contact-save-title">Save "{savingContact}"</div>
              <div className="split-pct-wrap">
                <span className="split-payment-prefix">Venmo</span>
                <span className="split-payment-at">@</span>
                <input
                  className="text-input split-payment-input split-payment-input--venmo"
                  placeholder="username"
                  value={saveVenmo.replace(/^@/, '')}
                  onChange={e => { const v = e.target.value.replace(/^@+/, ''); setSaveVenmo(v ? '@' + v : ''); }}
                  autoFocus
                />
              </div>
              <div className="split-pct-wrap" style={{ marginTop: 8 }}>
                <span className="split-payment-prefix">Zelle</span>
                <input
                  className="text-input split-payment-input"
                  placeholder="phone or email"
                  value={saveZelle}
                  onChange={e => handleZelleChange(e.target.value, setSaveZelle)}
                  onKeyDown={e => e.key === 'Enter' && persistContact(savingContact, saveVenmo, saveZelle)}
                />
              </div>
              <div className="contact-save-actions">
                <button className="contact-save-cancel" onClick={() => setSavingContact(null)}>Cancel</button>
                <button className="contact-save-confirm" onClick={() => persistContact(savingContact, saveVenmo, saveZelle)}>Save</button>
              </div>
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
              <div className="receipt-upload-area">
                <div className="receipt-upload-options">
                  <label className="receipt-upload-option">
                    <FontAwesomeIcon icon={faCamera} className="receipt-camera-icon" />
                    <span className="receipt-upload-label">Take Photo</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageSelect}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <label className="receipt-upload-option">
                    <FontAwesomeIcon icon={faUpload} className="receipt-camera-icon" />
                    <span className="receipt-upload-label">Upload Photo</span>
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
                <span className="receipt-upload-hint">Supports JPG, PNG, WEBP</span>
              </div>
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
        <button className="split-discount-toggle card-header" style={{ width: '100%' }} onClick={() => setShowTaxTip(v => !v)}>
          <span className="card-title">{showTaxTip ? '▾' : '▸'} Tax & Tip</span>
          {showTaxTip && (taxAmt > 0 || tipAmt > 0) && (
            <span className="split-discount-badge">+${(taxAmt + tipAmt).toFixed(2)}</span>
          )}
        </button>
        {showTaxTip && <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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

        </div>}
      </div>

      {/* ── Discount ───────────────────────────────────────── */}
      <div className="card">
        <button className="split-discount-toggle card-header" style={{ width: '100%' }} onClick={() => setShowDiscount(v => !v)}>
          <span className="card-title">{showDiscount ? '▾' : '▸'} Discount</span>
          {discountAmt > 0 && <span className="split-discount-badge">−${discountAmt.toFixed(2)}</span>}
        </button>
        {showDiscount && (
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label className="split-label" style={{ marginBottom: 0 }}>Discount</label>
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

      {/* ── Totals ─────────────────────────────────────────── */}
      {subtotal > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Total</span>
          </div>
          <div className="card-body">
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
          </div>
        </div>
      )}

      {/* ── Paid by ────────────────────────────────────────── */}
      {people.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Bill Fronted by</span>
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
                  <span className="split-payment-at">@</span>
                  <input
                    className="text-input split-payment-input split-payment-input--venmo"
                    placeholder="username"
                    value={venmo.replace(/^@/, '')}
                    onChange={e => { const v = e.target.value.replace(/^@+/, ''); setVenmo(v ? '@' + v : ''); }}
                  />
                </div>
                <div className="split-pct-wrap">
                  <span className="split-payment-prefix">Zelle</span>
                  <input
                    className="text-input split-payment-input"
                    placeholder="phone or email"
                    value={zelle}
                    onChange={e => handleZelleChange(e.target.value, setZelle)}
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
            const hasPaid = !!paidStatus[p.name];
            return (
              <div key={p.name} className={`split-person-row ${isPayer || hasPaid ? 'split-person-payer' : ''}`}>
                <div className="split-person-avatar">{p.name[0].toUpperCase()}</div>
                <div className="split-person-info">
                  <div className="split-person-name">
                    {p.name}
                    {isPayer && <span className="split-payer-tag">paid</span>}
                    {!isPayer && (
                      <button
                        className={`split-mark-paid-btn ${hasPaid ? 'split-mark-paid-btn--done' : ''}`}
                        onClick={() => setPaidStatus(prev => ({ ...prev, [p.name]: !prev[p.name] }))}
                      >
                        {hasPaid ? '✓ PAID' : '○ UNPAID'}
                      </button>
                    )}
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
                  {isPayer && (venmo || zelle) && (
                    <div className="split-pay-links">
                      {venmo && (
                        <span className="split-pay-btn split-pay-venmo">
                          Venmo {venmo.startsWith('@') ? venmo : `@${venmo}`}
                        </span>
                      )}
                      {zelle && (
                        <span className="split-pay-btn split-pay-zelle">
                          Zelle {zelle}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {isPayer ? (
                  <div className="split-person-total split-payer-total">covered</div>
                ) : (
                  <div className={`split-person-total ${hasPaid ? 'split-total-settled' : ''}`}>
                    ${p.total.toFixed(2)}
                  </div>
                )}
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
