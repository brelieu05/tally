import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLink, faCheck, faArrowUpRightFromSquare, faReceipt } from '@fortawesome/free-solid-svg-icons';

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000) {
    const hrs = Math.floor(diff / 3600000);
    return hrs < 1 ? 'Just now' : `${hrs}h ago`;
  }
  if (diff < 7 * 86400000) {
    const days = Math.floor(diff / 86400000);
    return `${days}d ago`;
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function billSummary(data) {
  const subtotal = (data.items || []).reduce((s, i) => s + i.price, 0);
  const discountAmt = data.discount
    ? (data.discountMode === '$'
        ? parseFloat(data.discount) || 0
        : subtotal * (parseFloat(data.discount) || 0) / 100)
    : 0;
  const discounted = subtotal - Math.min(discountAmt, subtotal);
  const taxAmt = data.tax
    ? (data.taxMode === '$'
        ? parseFloat(data.tax) || 0
        : discounted * (parseFloat(data.tax) || 0) / 100)
    : 0;
  const tipAmt = data.tip
    ? (data.tipMode === '$'
        ? parseFloat(data.tip) || 0
        : discounted * (parseFloat(data.tip) || 0) / 100)
    : 0;
  return { total: discounted + taxAmt + tipAmt, itemCount: (data.items || []).length };
}

export default function SplitHistory({ token }) {
  const [bills, setBills]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied]   = useState(null); // id of copied bill

  useEffect(() => {
    fetch('/api/split', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(rows => setBills(rows))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  function copyLink(id) {
    navigator.clipboard.writeText(`${window.location.origin}/split/${id}`).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  if (loading) return <div className="spinner" />;

  if (bills.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <FontAwesomeIcon icon={faReceipt} className="empty-icon" />
          <span className="empty-text">No shared splits yet</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Past splits</span>
        <span className="badge">{bills.length}</span>
      </div>
      {bills.map(({ id, data, created_at }) => {
        const { total, itemCount } = billSummary(data);
        const people = data.people || [];
        const isCopied = copied === id;
        return (
          <div key={id} className="split-history-row">
            <div className="split-history-info">
              <div className="split-history-people">
                {data.billName || (people.length > 0 ? people.join(', ') : <span style={{ color: 'var(--text-muted)' }}>Unnamed split</span>)}
              </div>
              {data.billName && people.length > 0 && (
                <div className="split-history-subtitle">{people.join(', ')}</div>
              )}
              <div className="split-history-meta">
                <span>${total.toFixed(2)}</span>
                <span className="expense-dot">·</span>
                <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                <span className="expense-dot">·</span>
                <span>{formatDate(created_at)}</span>
              </div>
            </div>
            <div className="split-history-actions">
              <button
                className={`split-history-btn ${isCopied ? 'copied' : ''}`}
                onClick={() => copyLink(id)}
                title="Copy link"
              >
                <FontAwesomeIcon icon={isCopied ? faCheck : faLink} />
              </button>
              <a
                className="split-history-btn"
                href={`/split/${id}`}
                target="_blank"
                rel="noreferrer"
                title="Open"
              >
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
